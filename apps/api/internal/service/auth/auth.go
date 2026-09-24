// Package auth implements admin login and token refresh.
// Login runs bcrypt even for unknown emails, so timing cannot reveal which emails exist.
// Each refresh token is a single-use row in refresh_tokens. Presenting a spent one revokes its family.
package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	auditsvc "landing-api/internal/service/audit"
	"landing-api/internal/utils"
	"landing-api/internal/utils/secure"
)

// errInvalidCredentials covers both an unknown email and a wrong password.
// One error for both keeps the endpoint from revealing which emails are registered.
var errInvalidCredentials = errors.New("invalid credentials")

// errAccountLocked maps to a 429. It is safe to tell apart from errInvalidCredentials
// because it only reports on attempts the caller made themselves.
var errAccountLocked = errors.New("account locked")

const (
	// lockAfterFailures matches loginLimiter's per-IP allowance of five.
	lockAfterFailures = 5
	// maxLockDuration caps the backoff. The lock is per source address, so an hour only costs
	// whoever earned it. Never make the lock permanent or account-wide: that locks out the real admin.
	maxLockDuration = 60 * time.Minute
	// loginFailureDecay is how long a failure counts. An older failure resets the count to one.
	// It must be shorter than maxLockDuration (checked below), or a source can hold the cap forever.
	// It must be longer than loginLimiter's 15-minute window, or the count resets between windows
	// and the backoff never climbs.
	loginFailureDecay = 30 * time.Minute
	// loginAttemptStale is well past loginFailureDecay, so the prune never deletes a row a live
	// decision still needs.
	loginAttemptStale = 24 * time.Hour
	// rotationGrace is how long a spent token still counts as a lost response, not a replay.
	rotationGrace = 30 * time.Second
)

// Build fails unless loginFailureDecay < maxLockDuration: a negative constant cannot convert to
// uint64. uint64, not uint, so the check still compiles on 32-bit builds.
const _ = uint64(maxLockDuration - loginFailureDecay - time.Nanosecond)

// lockDuration is 0 below lockAfterFailures, then doubles from one minute up to the cap.
// failures includes the failure being recorded.
func lockDuration(failures int32) time.Duration {
	if failures < lockAfterFailures {
		return 0
	}
	d := time.Minute << (failures - lockAfterFailures)
	if d > maxLockDuration || d <= 0 {
		return maxLockDuration
	}
	return d
}

// errInvalidToken covers every refusal of a refresh token. One status and body for all of them,
// so a caller cannot learn why, for example that the real admin already used the token.
var errInvalidToken = errors.New("invalid token")

// errTokenAlreadySpent never leaves this package. rotate returns it so Refresh can revoke the
// family after rotate's transaction has released the family lock.
var errTokenAlreadySpent = errors.New("refresh token already spent")

// LoginResult is what Login and Refresh return. The handler decides how the refresh token reaches the client.
type LoginResult struct {
	AccessToken      string
	RefreshToken     string
	RefreshExpiresAt time.Time
	Admin            models.RsAdminProfile
}

// dummyPasswordHash lets Login run bcrypt for unknown emails too, so response time cannot reveal
// which emails exist. Its cost must equal utils.bcryptCost exactly, or the timing differs; init checks.
const dummyPasswordHash = "$2a$12$hUQZsy0MRlWsdaOKt6/a5ugySbQvoGmsHDxBxLO8EIRoxbk6/.6GC" //nolint:gosec // a bcrypt hash of a fixed non-secret string, not a credential

//nolint:gochecknoinits // an invariant that must hold before the first request, with nothing to return an error to
func init() {
	if !utils.HashCostIsCurrent(dummyPasswordHash) {
		panic("auth: dummyPasswordHash must be a bcrypt hash at exactly utils.bcryptCost. A lower cost, a higher cost, or a value bcrypt cannot parse all break the timing match between the unknown-email path and the wrong-password path, which reopens the email-enumeration oracle this constant exists to close.")
	}
}

// Service keeps the pool because token rotation needs a transaction, which sqlc.Queries cannot open.
type Service struct {
	pool         *pgxpool.Pool
	queries      *sqlc.Queries
	tokenService *secure.TokenService
	audit        *auditsvc.Service
}

func New(pool *pgxpool.Pool, queries *sqlc.Queries, tokenService *secure.TokenService, audit *auditsvc.Service) *Service {
	return &Service{pool: pool, queries: queries, tokenService: tokenService, audit: audit}
}

// Login checks credentials and issues a new token pair. ip decides whose backoff a failure counts against.
func (s *Service) Login(ctx context.Context, req *models.RqLogin, ip, userAgent string) (*LoginResult, error) {
	// The lock is keyed on (email, ip), never the email alone: an account-wide lock would let anyone
	// who knows the email keep the real admin out. Unknown emails get rows too, so a lock never
	// reveals whether an account exists. No ip means no lock, since an empty ip is shared by every
	// such caller.
	if ip != "" {
		attempt, attemptErr := s.queries.GetLoginAttempt(ctx, sqlc.GetLoginAttemptParams{
			Email: req.Email,
			Ip:    ip,
		})
		if attemptErr != nil && !errors.Is(attemptErr, pgx.ErrNoRows) {
			slog.Error("reading login attempts failed", slog.Any("err", attemptErr))
			return nil, fmt.Errorf("get login attempt: %w", attemptErr)
		}
		if attempt.LockedUntil != nil && attempt.LockedUntil.After(time.Now()) {
			slog.Warn("login attempt against a locked email")
			// No admin lookup here, so the lock cannot probe whether the email is registered.
			s.audit.Record(ctx, auditsvc.EventLoginLocked, nil, ip, userAgent)
			return nil, errAccountLocked
		}
	}

	admin, err := s.queries.GetAdminByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Result discarded. This keeps the timing equal to a wrong password.
			utils.CheckPasswordHash(req.Password, dummyPasswordHash)
			slog.Warn("login attempt with unknown email")
			s.audit.Record(ctx, auditsvc.EventLoginFailed, nil, ip, userAgent)
			return nil, s.noteFailure(ctx, req.Email, ip)
		}
		slog.Error("failed to query admin during login", slog.Any("err", err))
		return nil, fmt.Errorf("get admin by email: %w", err)
	}

	if !utils.CheckPasswordHash(req.Password, admin.PasswordHash) {
		slog.Warn("login attempt with invalid password", slog.String("admin_id", admin.ID.String()))
		s.audit.Record(ctx, auditsvc.EventLoginFailed, &admin.ID, ip, userAgent)
		return nil, s.noteFailure(ctx, req.Email, ip)
	}

	// Clear only this pair, so a successful login does not wipe a stranger's backoff elsewhere.
	if ip != "" {
		if err := s.queries.ClearLoginAttempts(ctx, sqlc.ClearLoginAttemptsParams{
			Email: req.Email,
			Ip:    ip,
		}); err != nil {
			slog.Warn("clearing login attempts failed", slog.Any("err", err))
		}
	}

	// Upgrade an old-cost hash. A failure here must not fail a correct login.
	if utils.NeedsRehash(admin.PasswordHash) {
		if newHash, hashErr := utils.HashPassword(req.Password); hashErr != nil {
			slog.Error("rehash after login failed", slog.Any("err", hashErr))
		} else if updErr := s.queries.UpdateAdminPasswordHash(ctx, sqlc.UpdateAdminPasswordHashParams{
			ID:           admin.ID,
			PasswordHash: newHash,
		}); updErr != nil {
			slog.Error("storing rehashed password failed", slog.Any("err", updErr))
		} else {
			slog.Info("password hash upgraded", slog.String("admin_id", admin.ID.String()))
		}
	}

	// Pruning happens on login because there is no scheduled job.
	if err := s.queries.DeleteExpiredRefreshTokens(ctx, admin.ID); err != nil {
		slog.Warn("pruning expired refresh tokens failed", slog.Any("err", err))
	}

	// Prune by age, not by locked_until: a sprayer that stops at four failures is never locked.
	if err := s.queries.PruneLoginAttempts(ctx, time.Now().Add(-loginAttemptStale)); err != nil {
		slog.Warn("pruning login attempts failed", slog.Any("err", err))
	}

	slog.Info("admin login succeeded", slog.String("admin_id", admin.ID.String()))
	s.audit.Record(ctx, auditsvc.EventLoginSuccess, &admin.ID, ip, userAgent)

	// A login starts a new family. It is the only place the family's absolute deadline is set.
	return s.issueTokenPair(ctx, s.queries, admin, uuid.New(), uuid.New(),
		s.tokenService.SessionDeadline(time.Now()))
}

// noteFailure records a failed attempt and returns the error Login should surface.
// The backoff uses the count the increment returns, not the one Login read earlier, so concurrent
// failures cannot all see zero and skip the lock. A write failure is logged, not returned, so it
// looks the same as a wrong password.
func (s *Service) noteFailure(ctx context.Context, email, ip string) error {
	if ip == "" {
		return errInvalidCredentials
	}
	attempt, err := s.queries.RecordLoginFailure(ctx, sqlc.RecordLoginFailureParams{
		Email:       email,
		Ip:          ip,
		DecayBefore: time.Now().Add(-loginFailureDecay),
	})
	if err != nil {
		slog.Error("recording login failure failed", slog.Any("err", err))
		return errInvalidCredentials
	}
	if d := lockDuration(attempt.FailedCount); d > 0 {
		until := time.Now().Add(d)
		if err := s.queries.ExtendLoginLock(ctx, sqlc.ExtendLoginLockParams{
			Email:       email,
			Ip:          ip,
			LockedUntil: &until,
		}); err != nil {
			slog.Error("locking an email after repeated failures failed", slog.Any("err", err))
		}
	}
	return errInvalidCredentials
}

// Refresh validates a refresh token, spends it, and issues a replacement.
// Presenting a spent token revokes the whole family, unless resumeLostRotation treats it as a lost response.
func (s *Service) Refresh(ctx context.Context, refreshToken, ip, userAgent string) (*LoginResult, error) {
	claims, err := s.tokenService.ValidateRefreshToken(refreshToken)
	if err != nil {
		slog.Warn("refresh token validation failed", slog.Any("err", err))
		return nil, errInvalidToken
	}

	jti, err := uuid.Parse(claims.ID)
	if err != nil {
		slog.Warn("refresh token has no usable jti", slog.Any("err", err))
		return nil, errInvalidToken
	}

	row, err := s.queries.GetRefreshToken(ctx, jti)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("refresh token is not in the ledger")
			return nil, errInvalidToken
		}
		slog.Error("failed to read refresh token ledger", slog.Any("err", err))
		return nil, fmt.Errorf("get refresh token: %w", err)
	}

	if row.RevokedAt != nil {
		if result, handled, err := s.resumeLostRotation(ctx, row); handled {
			return result, err
		}
		slog.Warn("refresh token replay detected, revoking family",
			slog.String("admin_id", row.AdminID.String()),
			slog.String("family_id", row.FamilyID.String()))
		s.revokeFamilyAsReplay(ctx, row, ip, userAgent)
		return nil, errInvalidToken
	}

	// The JWT exp already covers this. If the ledger disagrees, the ledger wins.
	if row.ExpiresAt.Before(time.Now()) {
		slog.Warn("refresh token is past its ledger expiry")
		return nil, errInvalidToken
	}

	// expires_at is clamped to this deadline at issue time, but older rows may not be.
	if row.FamilyExpiresAt.Before(time.Now()) {
		slog.Warn("refresh token's family is past its absolute lifetime",
			slog.String("admin_id", row.AdminID.String()),
			slog.String("family_id", row.FamilyID.String()))
		return nil, errInvalidToken
	}

	admin, err := s.queries.GetAdminByID(ctx, row.AdminID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("refresh token names an admin that no longer exists",
				slog.String("admin_id", row.AdminID.String()))
			return nil, errInvalidToken
		}
		slog.Error("failed to query admin during refresh", slog.Any("err", err))
		return nil, fmt.Errorf("get admin by id: %w", err)
	}

	result, err := s.rotate(ctx, admin, jti, row.FamilyID, row.FamilyExpiresAt)
	if err != nil {
		if errors.Is(err, errTokenAlreadySpent) {
			// Another request spent this token after our read. Handle it exactly like the revoked
			// row above. Re-read first: revoked_at and replaced_by have just changed.
			spent, readErr := s.queries.GetRefreshToken(ctx, jti)
			if readErr != nil && !errors.Is(readErr, pgx.ErrNoRows) {
				// A failed read must not revoke the family.
				slog.Error("re-reading a concurrently spent token failed", slog.Any("err", readErr))
				return nil, fmt.Errorf("get refresh token after concurrent spend: %w", readErr)
			}
			if readErr == nil {
				if resumed, handled, resumeErr := s.resumeLostRotation(ctx, spent); handled {
					return resumed, resumeErr
				}
			}

			slog.Warn("refresh token was spent by a concurrent request, revoking family",
				slog.String("admin_id", row.AdminID.String()),
				slog.String("family_id", row.FamilyID.String()))
			s.revokeFamilyAsReplay(ctx, row, ip, userAgent)
			return nil, errInvalidToken
		}
		return nil, err
	}

	slog.Info("token refresh succeeded", slog.String("admin_id", admin.ID.String()))
	return result, nil
}

// resumeLostRotation handles a rotation whose response never reached the client, such as a tab
// closed mid-request. If row was spent within rotationGrace and its successor is still live, it
// re-signs that successor with its own expiry and writes nothing. When handled is false, the
// caller goes on to the replay path.
// The cost: a thief replaying inside the grace window is not detected.
func (s *Service) resumeLostRotation(ctx context.Context, row sqlc.RefreshToken) (*LoginResult, bool, error) {
	if row.ReplacedBy == nil || row.RevokedAt == nil || time.Since(*row.RevokedAt) > rotationGrace {
		return nil, false, nil
	}

	successor, err := s.queries.GetRefreshToken(ctx, *row.ReplacedBy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, false, nil
		}
		// Answer with the error. Falling through would revoke the family over a database hiccup.
		slog.Error("reading a spent token's successor failed", slog.Any("err", err))
		return nil, true, fmt.Errorf("get successor refresh token: %w", err)
	}

	now := time.Now()
	if successor.RevokedAt != nil || successor.ExpiresAt.Before(now) || successor.FamilyExpiresAt.Before(now) {
		// A dead successor means someone kept rotating the chain. That is not a lost response.
		return nil, false, nil
	}

	admin, err := s.queries.GetAdminByID(ctx, successor.AdminID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("a spent token's successor names an admin that no longer exists",
				slog.String("admin_id", successor.AdminID.String()))
			return nil, true, errInvalidToken
		}
		slog.Error("failed to query admin while resuming a lost rotation", slog.Any("err", err))
		return nil, true, fmt.Errorf("get admin by id: %w", err)
	}

	accessToken, err := s.tokenService.GenerateAccessToken(admin.ID, admin.Email)
	if err != nil {
		return nil, true, fmt.Errorf("generate access token: %w", err)
	}
	refreshToken, err := s.tokenService.SignRefreshToken(successor.AdminID, successor.Jti, successor.ExpiresAt)
	if err != nil {
		return nil, true, fmt.Errorf("re-sign successor refresh token: %w", err)
	}

	slog.Info("resent the successor of a rotation whose response was lost",
		slog.String("admin_id", admin.ID.String()),
		slog.String("family_id", successor.FamilyID.String()))

	return &LoginResult{
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: successor.ExpiresAt,
		Admin: models.RsAdminProfile{
			ID:        admin.ID,
			Email:     admin.Email,
			CreatedAt: admin.CreatedAt.Format(time.RFC3339),
		},
	}, true, nil
}

// Logout revokes every token in the presented token's family. It returns nothing, so a caller has
// nothing to probe. It uses revokeFamily's lock so a concurrent rotation's successor is not missed.
func (s *Service) Logout(ctx context.Context, refreshToken, ip, userAgent string) {
	claims, err := s.tokenService.ValidateRefreshToken(refreshToken)
	if err != nil {
		return
	}
	jti, err := uuid.Parse(claims.ID)
	if err != nil {
		return
	}
	row, err := s.queries.GetRefreshToken(ctx, jti)
	if err != nil {
		// No row is normal. Log any other error, because the caller is never told.
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("reading the token ledger on logout failed", slog.Any("err", err))
		}
		return
	}
	if err := s.revokeFamily(ctx, row.FamilyID); err != nil {
		slog.Error("revoking family on logout failed", slog.Any("err", err))
		return
	}
	slog.Info("admin logout", slog.String("admin_id", row.AdminID.String()))
	s.audit.Record(ctx, auditsvc.EventLogout, &row.AdminID, ip, userAgent)
}

// rotate spends the presented token and issues its successor in one transaction, under the
// family's advisory lock, which orders it against a concurrent family revoke. The revoke only
// matches an unrevoked row, so when two requests race with one token, exactly one wins.
func (s *Service) rotate(ctx context.Context, admin sqlc.AdminUser, jti, familyID uuid.UUID, familyExpiresAt time.Time) (*LoginResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin token rotation: %w", err)
	}
	// Releases the family lock. Without it, revokeFamilyAsReplay would wait on the lock and hang.
	defer func() {
		if rbErr := tx.Rollback(ctx); rbErr != nil && !errors.Is(rbErr, pgx.ErrTxClosed) {
			slog.Warn("rolling back token rotation failed", slog.Any("err", rbErr))
		}
	}()

	qtx := s.queries.WithTx(tx)

	if err := qtx.LockTokenFamily(ctx, familyID); err != nil {
		slog.Error("locking refresh token family failed", slog.Any("err", err))
		return nil, fmt.Errorf("lock token family: %w", err)
	}

	// Minted here so the revoke can write it into replaced_by, which resumeLostRotation reads.
	successorJti := uuid.New()

	spent, err := qtx.RevokeRefreshToken(ctx, sqlc.RevokeRefreshTokenParams{
		Jti:        jti,
		ReplacedBy: &successorJti,
	})
	if err != nil {
		slog.Error("revoking spent refresh token failed", slog.Any("err", err))
		return nil, fmt.Errorf("revoke refresh token: %w", err)
	}
	if spent == 0 {
		return nil, errTokenAlreadySpent
	}

	// Carry familyExpiresAt forward. Recomputing it turns the session lifetime into an idle timeout.
	result, err := s.issueTokenPair(ctx, qtx, admin, familyID, successorJti, familyExpiresAt)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("committing token rotation failed", slog.Any("err", err))
		return nil, fmt.Errorf("commit token rotation: %w", err)
	}

	return result, nil
}

// revokeFamilyAsReplay revokes the family and records the replay. The audit row does not prove
// the revoke worked; a failed revoke shows only in the error log.
func (s *Service) revokeFamilyAsReplay(ctx context.Context, row sqlc.RefreshToken, ip, userAgent string) {
	if err := s.revokeFamily(ctx, row.FamilyID); err != nil {
		slog.Error("revoking refresh token family failed", slog.Any("err", err))
	}
	s.audit.Record(ctx, auditsvc.EventTokenReuse, &row.AdminID, ip, userAgent)
}

// revokeFamily revokes every live token in one family under the family's advisory lock.
// Without the lock, the UPDATE could miss a successor that a concurrent rotation inserts.
func (s *Service) revokeFamily(ctx context.Context, familyID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin family revoke: %w", err)
	}
	defer func() {
		if rbErr := tx.Rollback(ctx); rbErr != nil && !errors.Is(rbErr, pgx.ErrTxClosed) {
			slog.Warn("rolling back family revoke failed", slog.Any("err", rbErr))
		}
	}()

	qtx := s.queries.WithTx(tx)

	if err := qtx.LockTokenFamily(ctx, familyID); err != nil {
		return fmt.Errorf("lock token family: %w", err)
	}

	if err := qtx.RevokeRefreshTokenFamily(ctx, familyID); err != nil {
		return fmt.Errorf("revoke refresh token family: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit family revoke: %w", err)
	}

	return nil
}

// issueTokenPair signs a token pair and records the refresh token through q. A rotation passes
// its transaction handle so the insert commits with the revoke.
func (s *Service) issueTokenPair(ctx context.Context, q *sqlc.Queries, admin sqlc.AdminUser, familyID, jti uuid.UUID, familyExpiresAt time.Time) (*LoginResult, error) {
	accessToken, err := s.tokenService.GenerateAccessToken(admin.ID, admin.Email)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	refreshToken, expiresAt, err := s.tokenService.GenerateRefreshToken(admin.ID, jti, familyExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	if err := q.CreateRefreshToken(ctx, sqlc.CreateRefreshTokenParams{
		Jti:             jti,
		AdminID:         admin.ID,
		FamilyID:        familyID,
		ExpiresAt:       expiresAt,
		FamilyExpiresAt: familyExpiresAt,
	}); err != nil {
		// A token with no ledger row would fail on its first refresh, so fail now.
		return nil, fmt.Errorf("store refresh token: %w", err)
	}

	return &LoginResult{
		AccessToken:      accessToken,
		RefreshToken:     refreshToken,
		RefreshExpiresAt: expiresAt,
		Admin: models.RsAdminProfile{
			ID:        admin.ID,
			Email:     admin.Email,
			CreatedAt: admin.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

// IsInvalidCredentials reports whether err is the credentials failure Login returns.
func IsInvalidCredentials(err error) bool {
	return errors.Is(err, errInvalidCredentials)
}

// IsInvalidToken reports whether err is the token failure Refresh returns.
func IsInvalidToken(err error) bool {
	return errors.Is(err, errInvalidToken)
}

// IsAccountLocked reports whether err is the backoff failure Login returns.
func IsAccountLocked(err error) bool {
	return errors.Is(err, errAccountLocked)
}
