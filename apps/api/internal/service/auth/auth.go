// Package auth implements admin login and token refresh. Mirrors
// ~/work/psyfint_v2_back/internal/service/auth/auth.go, with two deliberate differences. Login
// always runs bcrypt, even when the email does not exist (see the comment on dummyPasswordHash
// below), where psyfint returns on pgx.ErrNoRows before ever calling bcrypt. And a refresh token
// is not stateless here: every one has a row in refresh_tokens, is spent by the call that
// exchanges it, and takes every token descended from the same login down with it if it is ever
// presented twice (see Refresh).
package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	auditsvc "landing-api/internal/service/audit"
	"landing-api/internal/utils"
	"landing-api/internal/utils/secure"
)

// errInvalidCredentials is returned for BOTH an unknown email and a wrong password, and for
// nothing else. One error for both failure modes is what keeps the endpoint from being an
// account-existence oracle: a caller who can tell "no such admin" apart from "wrong password"
// can enumerate every registered email with one request per guess.
var errInvalidCredentials = errors.New("invalid credentials")

// errInvalidToken is returned for every way a refresh token can be refused: a bad signature, the
// wrong token type, an unreadable jti, no matching ledger row, a row already spent, a row past its
// expiry, and a token naming an admin that no longer exists. They all collapse to the same error
// and the same 401 on purpose. An attacker who can tell "token malformed" from "admin was deleted"
// from "that one was already used" learns something the token itself did not entitle them to know,
// and the last of those would tell a thief exactly when the real admin noticed.
var errInvalidToken = errors.New("invalid token")

// LoginResult is what Login and Refresh hand back. It is not models.RsAuth, because the refresh
// token is not part of the response body's shape: how it reaches the client, in the body or as a
// Set-Cookie header, is the handler's decision, and the handler is the only layer that should
// know which.
type LoginResult struct {
	AccessToken      string
	RefreshToken     string
	RefreshExpiresAt time.Time
	Admin            models.RsAdminProfile
}

// dummyPasswordHash is a bcrypt hash of a fixed string nobody's real password is checked
// against. It exists so Login can run bcrypt.CompareHashAndPassword on every attempt, including
// one against an email that is not registered.
//
// psyfint_v2_back returns on pgx.ErrNoRows before comparing anything, which is faster for that
// one path -- and that speed difference is exactly what makes it an oracle: bcrypt is
// deliberately slow (that is its entire purpose), so a request that skips it returns measurably
// sooner than one that runs it. An attacker timing responses can use that gap to enumerate valid
// emails without ever seeing a different error message. Comparing against this fixed hash costs
// one bcrypt call on every path and closes the gap the identical error message alone does not.
//
// Closing it depends on this hash comparing in the same time as a real one, and bcrypt's running
// time is set by the cost encoded in the hash it is handed. So the cost has to match exactly, not
// merely keep up. A lower cost makes the unknown-email path the faster one, a higher cost makes it
// the slower one, and either difference enumerates emails just as well. A value bcrypt cannot
// parse at all is the worst of the three: CompareHashAndPassword rejects it on the parse and does
// no hashing whatsoever, which measures at 3ns against 200ms for a real cost-12 compare. init
// below refuses to start on any of them.
const dummyPasswordHash = "$2a$12$hUQZsy0MRlWsdaOKt6/a5ugySbQvoGmsHDxBxLO8EIRoxbk6/.6GC" //nolint:gosec // a bcrypt hash of a fixed non-secret string, not a credential

// A wrong security invariant should stop the process rather than warn, which is what conf.Load
// already does for an empty or too-short JWT secret outside development. The check is cheap, it
// is correct only at startup, and there is no caller to return an error to.
//
//nolint:gochecknoinits // an invariant that must hold before the first request, with nothing to return an error to
func init() {
	if !utils.HashCostIsCurrent(dummyPasswordHash) {
		panic("auth: dummyPasswordHash must be a bcrypt hash at exactly utils.bcryptCost. A lower cost, a higher cost, or a value bcrypt cannot parse all break the timing match between the unknown-email path and the wrong-password path, which reopens the email-enumeration oracle this constant exists to close.")
	}
}

type Service struct {
	queries      *sqlc.Queries
	tokenService *secure.TokenService
	audit        *auditsvc.Service
}

func New(queries *sqlc.Queries, tokenService *secure.TokenService, audit *auditsvc.Service) *Service {
	return &Service{queries: queries, tokenService: tokenService, audit: audit}
}

// Login checks req's credentials and, on success, issues a fresh access/refresh token pair. ip
// and userAgent are recorded against the attempt, successful or not, and are never used to decide
// whether it succeeds.
func (s *Service) Login(ctx context.Context, req *models.RqLogin, ip, userAgent string) (*LoginResult, error) {
	admin, err := s.queries.GetAdminByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// See dummyPasswordHash above: run bcrypt here too, even though the result is
			// discarded, so this branch takes the same time as a registered email with the
			// wrong password.
			utils.CheckPasswordHash(req.Password, dummyPasswordHash)
			slog.Warn("login attempt with unknown email")
			s.audit.Record(ctx, auditsvc.EventLoginFailed, nil, ip, userAgent)
			return nil, errInvalidCredentials
		}
		slog.Error("failed to query admin during login", slog.Any("err", err))
		return nil, fmt.Errorf("get admin by email: %w", err)
	}

	if !utils.CheckPasswordHash(req.Password, admin.PasswordHash) {
		slog.Warn("login attempt with invalid password", slog.String("admin_id", admin.ID.String()))
		s.audit.Record(ctx, auditsvc.EventLoginFailed, &admin.ID, ip, userAgent)
		return nil, errInvalidCredentials
	}

	// Upgrade a hash written at an older cost. Deliberately not fatal: the caller supplied the
	// right password, and refusing the login because a background rewrite failed would turn a
	// housekeeping problem into an outage. Logged and ignored, and retried on the next login.
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

	// Housekeeping while we have the admin id. Bounded with no scheduled job: a dead row can
	// only outlive its expiry until its owner next signs in. A failure here is not worth failing
	// a valid login over.
	if err := s.queries.DeleteExpiredRefreshTokens(ctx, admin.ID); err != nil {
		slog.Warn("pruning expired refresh tokens failed", slog.Any("err", err))
	}

	slog.Info("admin login succeeded", slog.String("admin_id", admin.ID.String()))
	s.audit.Record(ctx, auditsvc.EventLoginSuccess, &admin.ID, ip, userAgent)

	// A login starts a new family. Nothing issued before it is related to it, so a replay
	// detected later cannot reach back and revoke a session the admin started deliberately.
	return s.issueTokenPair(ctx, admin, uuid.New())
}

// Refresh validates a refresh token, spends it, and issues a replacement. The admin row is
// re-read rather than trusted from the token's claims, so an admin removed after the refresh
// token was issued cannot use it to obtain a new access token.
//
// The ledger lookup is what makes a refresh token single-use. Presenting one that has already
// been spent means two parties hold the same token, and only one of them came by it honestly, so
// the entire family dies and both are forced back to the login screen. That is deliberately
// disruptive: the alternative is letting a thief keep rotating quietly for a week.
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
			// Signed by us, but no ledger row: either issued before this table existed, or the
			// row was pruned. Neither is a token we are willing to honour.
			slog.Warn("refresh token is not in the ledger")
			return nil, errInvalidToken
		}
		slog.Error("failed to read refresh token ledger", slog.Any("err", err))
		return nil, fmt.Errorf("get refresh token: %w", err)
	}

	if row.RevokedAt != nil {
		slog.Warn("refresh token replay detected, revoking family",
			slog.String("admin_id", row.AdminID.String()),
			slog.String("family_id", row.FamilyID.String()))
		s.revokeFamilyAsReplay(ctx, row, ip, userAgent)
		return nil, errInvalidToken
	}

	// Belt and braces. The JWT's own exp claim already covers this, so reaching here means the
	// ledger and the token disagree, and the ledger wins.
	if row.ExpiresAt.Before(time.Now()) {
		slog.Warn("refresh token is past its ledger expiry")
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

	// Revoke before issuing, never after. If the insert then fails, the family has no live token
	// and the admin logs in again, which is an annoyance. The other order can leave two live
	// tokens after a crash, which is the exact state replay detection exists to make impossible.
	//
	// The revoke is also what claims the token, which is why its row count is read rather than
	// discarded. The check above cannot do that job: two requests carrying the same live token can
	// both pass it, because neither has written anything yet. The UPDATE settles it instead, by
	// matching only a row that is still unrevoked (see RevokeRefreshToken). Exactly one of the two
	// changes a row.
	spent, err := s.queries.RevokeRefreshToken(ctx, jti)
	if err != nil {
		slog.Error("revoking spent refresh token failed", slog.Any("err", err))
		return nil, fmt.Errorf("revoke refresh token: %w", err)
	}
	if spent == 0 {
		// Someone else spent this token between the read above and this write. That is the same
		// event as the already-revoked row above, only caught a few milliseconds earlier, and it
		// gets the same answer. A client that fires two refreshes at once on one token is
		// indistinguishable from a thief racing its owner, and pays the same price.
		slog.Warn("refresh token was spent by a concurrent request, revoking family",
			slog.String("admin_id", row.AdminID.String()),
			slog.String("family_id", row.FamilyID.String()))
		s.revokeFamilyAsReplay(ctx, row, ip, userAgent)
		return nil, errInvalidToken
	}

	slog.Info("token refresh succeeded", slog.String("admin_id", admin.ID.String()))
	return s.issueTokenPair(ctx, admin, row.FamilyID)
}

// revokeFamilyAsReplay kills every token descended from the same login and records the detection.
// Two paths reach it: a token whose ledger row was already revoked, and a token another request
// spent while this one was working. Both mean two parties held one token, and neither tells us
// which of the two is the one asking now, so both lose the session.
func (s *Service) revokeFamilyAsReplay(ctx context.Context, row sqlc.RefreshToken, ip, userAgent string) {
	if err := s.queries.RevokeRefreshTokenFamily(ctx, row.FamilyID); err != nil {
		slog.Error("revoking refresh token family failed", slog.Any("err", err))
	}
	s.audit.Record(ctx, auditsvc.EventTokenReuse, &row.AdminID, ip, userAgent)
}

// issueTokenPair signs a new access and refresh token and records the refresh token in the
// ledger under familyID. A login passes a fresh familyID; a rotation passes the one the
// presented token already belonged to, which is what lets replay revoke the whole chain.
func (s *Service) issueTokenPair(ctx context.Context, admin sqlc.AdminUser, familyID uuid.UUID) (*LoginResult, error) {
	accessToken, err := s.tokenService.GenerateAccessToken(admin.ID, admin.Email)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}

	jti := uuid.New()
	refreshToken, expiresAt, err := s.tokenService.GenerateRefreshToken(admin.ID, jti)
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	if err := s.queries.CreateRefreshToken(ctx, sqlc.CreateRefreshTokenParams{
		Jti:       jti,
		AdminID:   admin.ID,
		FamilyID:  familyID,
		ExpiresAt: expiresAt,
	}); err != nil {
		// Fail the whole call. A signed refresh token with no ledger row is worse than no token:
		// Refresh would reject it as unknown, so the admin would appear to log in and then be
		// bounced on their first refresh with nothing explaining why.
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

// IsInvalidCredentials reports whether err is the credentials failure Login returns, so the
// handler can map it to its own status and message without importing an unexported sentinel.
func IsInvalidCredentials(err error) bool {
	return errors.Is(err, errInvalidCredentials)
}

// IsInvalidToken reports whether err is the token failure Refresh returns.
func IsInvalidToken(err error) bool {
	return errors.Is(err, errInvalidToken)
}
