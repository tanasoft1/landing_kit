// Package auth implements admin login and token refresh. Two properties of it are deliberate.
// Login always runs bcrypt, even when the email does not exist (see the comment on
// dummyPasswordHash below), so response time cannot tell an unregistered email from a wrong
// password. And a refresh token is not stateless here: every one has a row in refresh_tokens, is
// spent by the call that exchanges it, and takes every token descended from the same login down
// with it if it is ever presented twice (see Refresh).
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

// errInvalidCredentials is returned for BOTH an unknown email and a wrong password, and for
// nothing else. One error for both failure modes is what keeps the endpoint from being an
// account-existence oracle: a caller who can tell "no such admin" apart from "wrong password"
// can enumerate every registered email with one request per guess.
var errInvalidCredentials = errors.New("invalid credentials")

// errAccountLocked is returned when an email has failed too many times recently, whether or not
// it belongs to a real account. Separate from errInvalidCredentials because it maps to a 429 the
// panel shows differently, and safe to distinguish for one reason: it only ever tells a caller
// about attempts they made themselves.
var errAccountLocked = errors.New("account locked")

const (
	// lockAfterFailures is how many failures a legitimate typo budget absorbs before backoff
	// starts. Five matches loginLimiter's per-IP allowance, so neither wall is reached first by
	// accident.
	lockAfterFailures = 5
	// maxLockDuration caps the curve. Backoff, never a permanent lockout: a hard lock means
	// anyone who knows the admin's email can deny them access indefinitely, which trades an
	// authentication problem for an availability one.
	maxLockDuration = 15 * time.Minute
	// loginFailureDecay is how long a failure counts towards the curve. It is what keeps the
	// sentence above true, and the code did not have it: failed_count only ever grew, so an email
	// that had failed nine times sat at maxLockDuration permanently and every later failure
	// re-locked it for the full fifteen minutes. One request every fifteen minutes was enough to
	// hold a known admin address shut forever -- a hard lock by accumulation, reachable by anyone
	// who knows the email.
	//
	// Thirty minutes is longer than the longest lock the curve can set, so an attacker cannot
	// simply wait out a lock and resume at the same count. It also means holding the lock costs a
	// sustained rate rather than four requests an hour, and the per-IP limiter bounds that rate.
	loginFailureDecay = 30 * time.Minute
	// loginAttemptStale is how old the last failure must be before PruneLoginAttempts deletes the
	// row. Well past loginFailureDecay, so the prune can never remove a row a live decision would
	// still have read.
	loginAttemptStale = 24 * time.Hour
	// rotationGrace is how long after a rotation the token it spent is still honoured as a lost
	// response rather than treated as a replay. See Refresh.
	rotationGrace = 30 * time.Second
)


// lockDuration is the backoff curve: nothing for the first four failures, then doubling from one
// minute, capped. failures is the count AFTER the failure being recorded.
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

// errInvalidToken is returned for every way a refresh token can be refused: a bad signature, the
// wrong token type, an unreadable jti, no matching ledger row, a row already spent, a row past its
// expiry, and a token naming an admin that no longer exists. Every one of them answers with the
// same status and the same body on purpose. An attacker who can tell "token malformed" from "admin
// was deleted" from "that one was already used" learns something the token itself did not entitle
// them to know, and the last of those would tell a thief exactly when the real admin noticed.
//
// Timing is not identical, and saying otherwise would overstate what the code delivers. The two
// replay branches revoke a family and write an audit row before answering; a token with no ledger
// row answers after a single SELECT. That residue is worth living with. The endpoint is rate
// limited, so the gap cannot be sampled enough times to lift it out of network noise, and what it
// leaks is only that the presented token was already spent -- a state the replay itself created,
// about a token its holder already has.
var errInvalidToken = errors.New("invalid token")

// errTokenAlreadySpent is internal to this package and never reaches a handler. It is how rotate
// tells Refresh that another request claimed the presented token, so Refresh can revoke the
// family AFTER rotate's transaction has been rolled back and released the family lock.
var errTokenAlreadySpent = errors.New("refresh token already spent")

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
// Returning on pgx.ErrNoRows before comparing anything would be faster for that one path --
// and that speed difference is exactly what would make it an oracle: bcrypt is
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

// Service holds the pool as well as the queries built from it, because sqlc.Queries can only run
// statements, not open a transaction. Refresh needs one: spending a token and issuing its
// successor have to commit together, under a lock that no other writer on the same family can
// cross.
type Service struct {
	pool         *pgxpool.Pool
	queries      *sqlc.Queries
	tokenService *secure.TokenService
	audit        *auditsvc.Service
}

func New(pool *pgxpool.Pool, queries *sqlc.Queries, tokenService *secure.TokenService, audit *auditsvc.Service) *Service {
	return &Service{pool: pool, queries: queries, tokenService: tokenService, audit: audit}
}

// Login checks req's credentials and, on success, issues a fresh access/refresh token pair. ip and
// userAgent are recorded against the attempt, successful or not. Neither has any say in whether
// the credentials are accepted; ip does decide whose backoff this attempt counts against, which is
// a separate question and the subject of the comment below.
func (s *Service) Login(ctx context.Context, req *models.RqLogin, ip, userAgent string) (*LoginResult, error) {
	// Read the lock before anything else, and read it for every email rather than only for
	// registered ones: rows exist for any address that has failed, registered or not, so a
	// lockout can never reveal that an account exists.
	//
	// The lock is keyed on the email AND the address the attempt came from, and skipped entirely
	// when there is no address. Both halves matter.
	//
	// Keyed on the pair, because an account-wide lock is a denial of service against anyone whose
	// email is known. It cannot be anything else: deciding whether the real admin or a stranger is
	// knocking means checking the password, and refusing to check the password is what the lock
	// is. So a stranger who sent one failed login each time the lock lapsed kept the address shut
	// and kept the admin out with it. Per source, that stranger locks out their own source and
	// nobody else. The cost is that a throttle spanning many source addresses is gone; it is the
	// same property, so it could not be kept. Guessing is still charged per source on top of
	// loginLimiter, which allows five attempts per fifteen minutes from one address.
	//
	// Skipped without an address, because an empty ip is not an address, it is every caller who
	// arrived without one, and a lock on that shared bucket is the account-wide lock again under
	// another name. The rate limiters make the same call for the same reason -- see
	// clientKeyGenerator in internal/http/routes, which hands an unresolvable caller a key of
	// their own rather than letting them join everyone else's. Failing open for one request beats
	// a defence that can lock out a real admin. The audit rows below are written either way: a
	// failed login is a fact worth recording whether or not it can be counted against a source.
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
			// Recorded, not merely logged. This branch returns before every other audit write in
			// Login, so an attacker hammering a locked address used to leave nothing in
			// admin_audit_log at all -- the table an operator reads to find out they are under
			// attack stayed empty for exactly the attack it should have shown. No admin id: the
			// row is not looked up on this path, deliberately, since doing so would make the lock
			// a probe for whether the address is registered.
			s.audit.Record(ctx, auditsvc.EventLoginLocked, nil, ip, userAgent)
			return nil, errAccountLocked
		}
	}

	admin, err := s.queries.GetAdminByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// See dummyPasswordHash above: run bcrypt here too, even though the result is
			// discarded, so this branch takes the same time as a registered email with the
			// wrong password.
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

	// Only this pair, never every row for the email. A successful sign-in from the office should
	// not wipe the backoff a stranger elsewhere has been accumulating against the same address.
	if ip != "" {
		if err := s.queries.ClearLoginAttempts(ctx, sqlc.ClearLoginAttemptsParams{
			Email: req.Email,
			Ip:    ip,
		}); err != nil {
			slog.Warn("clearing login attempts failed", slog.Any("err", err))
		}
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

	// The same bargain for login_attempts, which ClearLoginAttempts above only ever empties for
	// the one email and source that just succeeded. A row for an address that failed and was never
	// tried again would otherwise live forever, so a spray across a million addresses leaves a
	// million rows, and now one per source that tried each of them.
	//
	// The prune keys on staleness, not on the lock. Keying on locked_until only reached rows that
	// had failed five times, and the million-address sprayer stops at four.
	if err := s.queries.PruneLoginAttempts(ctx, time.Now().Add(-loginAttemptStale)); err != nil {
		slog.Warn("pruning login attempts failed", slog.Any("err", err))
	}

	slog.Info("admin login succeeded", slog.String("admin_id", admin.ID.String()))
	s.audit.Record(ctx, auditsvc.EventLoginSuccess, &admin.ID, ip, userAgent)

	// A login starts a new family. Nothing issued before it is related to it, so a replay
	// detected later cannot reach back and revoke a session the admin started deliberately.
	//
	// This is also the only place the family's absolute deadline is chosen. Every rotation copies
	// it forward untouched, so signing in again is the one way to get a later one.
	return s.issueTokenPair(ctx, s.queries, admin, uuid.New(), uuid.New(),
		s.tokenService.SessionDeadline(time.Now()))
}

// noteFailure records a failed attempt and returns the error Login should surface.
//
// The count that feeds the backoff comes from the row the increment itself returns, not from the
// row read at the top of Login. That distinction is the whole defence. A count read earlier is
// already stale by the time the window is computed, so twenty requests firing at once would all
// read zero, all compute "no lock yet", and all write one -- twenty free guesses against a fresh
// email, which is precisely the many-address attacker this backoff exists to stop. Taking the
// count from the write instead gives each request its own position in the sequence, so the
// twentieth locks for the twentieth failure's window no matter how close together they arrive.
//
// The lock is a second statement rather than a column on the first because the window is not
// known until the increment has answered. It costs one more round trip on a failed login past the
// threshold, which is nothing beside the ~200ms of bcrypt the same request has already spent. A
// write failure is logged, not returned: the caller supplied bad credentials either way, and
// refusing to answer would hand an attacker a way to tell a bookkeeping error from a wrong
// password.
//
// The count the write returns is a decayed one, not a running total: a previous failure older than
// loginFailureDecay resets it to one instead of adding to it, in the same statement, so two
// concurrent failures cannot disagree about whether the window had lapsed.
//
// The count belongs to the pair (email, ip), and a caller with no resolvable address gets no count
// at all. Both follow from the lock Login reads; the reasoning is written there. The audit row for
// this failure is already written by the time we are called, so nothing about the attempt goes
// unrecorded when the counting is skipped.
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

// Refresh validates a refresh token, spends it, and issues a replacement. The admin row is
// re-read rather than trusted from the token's claims, so an admin removed after the refresh
// token was issued cannot use it to obtain a new access token.
//
// The ledger lookup is what makes a refresh token single-use. Presenting one that has already been
// spent means two parties hold the same token, and only one of them came by it honestly, so the
// entire family dies and both are forced back to the login screen. That is deliberately disruptive:
// the alternative is letting a thief keep rotating quietly for a week.
//
// With one exception, and only one: a token spent within rotationGrace whose successor is still
// live. That is what a rotation whose response went missing looks like, and it was costing honest
// admins their session for closing a tab at the wrong moment. See resumeLostRotation, which both
// spent-token paths below go through.
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
		if result, handled, err := s.resumeLostRotation(ctx, row); handled {
			return result, err
		}
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

	// The family's absolute deadline, refused exactly like an expired row: same error, same
	// status, same body, per errInvalidToken's uniformity above. Every row's own expires_at is
	// clamped to this value at issue time, so the check above almost always fires first -- almost,
	// because a row written before the clamp existed has no such guarantee, and a check that only
	// holds for rows this version wrote is not a bound.
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
			// Someone else spent this token between the ledger read above and rotate's write. That
			// is the same event as the already-revoked row above, caught a few milliseconds
			// earlier, and it now gets the same answer in both senses: same grace window, same
			// no-write rule, same fall-through to the replay path when the window does not apply.
			//
			// The two paths converge deliberately. They used to differ -- this one always revoked
			// the family -- and the difference was an accident of where the race is noticed, not a
			// judgement about what it means. Both are "this token was spent by somebody else
			// moments ago", and the winner's successor is live either way. Do not restore the
			// asymmetry; it was never reasoned for.
			//
			// The row read at the top of Refresh is stale here by definition: the winner committed
			// after it. So re-read, because revoked_at and replaced_by are exactly the two columns
			// that changed and exactly the two resumeLostRotation needs.
			spent, readErr := s.queries.GetRefreshToken(ctx, jti)
			if readErr != nil && !errors.Is(readErr, pgx.ErrNoRows) {
				// Same reasoning as in resumeLostRotation: revoking a family because a read failed
				// is the wrong answer to "we do not know".
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

// resumeLostRotation decides whether a revoked row is a rotation whose response never reached the
// client, and if it is, hands that client the successor it never received. handled reports whether
// this function answered the request; when it is false the caller carries on to the replay path
// unchanged.
//
// Both of Refresh's ways of meeting a spent token come here: the row that was already revoked when
// Refresh read it, and the row another request spent while rotate was working. They are one event
// seen at two moments, and one function answering both is what keeps them from drifting apart
// again.
//
// The case it exists for needs no attacker and no race. A refresh commits, the response is lost --
// the tab closed mid-flight, the network dropped, a proxy timed out -- and the browser still holds
// the cookie the server has already spent. The next refresh presented it, found revoked_at set, and
// killed the whole family. Closing a tab at the wrong moment logged the admin out and wrote a
// token_reuse_detected row, which internal/service/audit calls the only signal a refresh token was
// stolen. Honest clients writing that row routinely is how a real one gets ignored.
//
// What this trades, plainly: a thief who replays a stolen token within rotationGrace of an honest
// rotation is not detected, and lands in the same live session the honest client holds. That is a
// real cost, not a free win. It is much smaller than the one the old behaviour charged real admins,
// because the thief's window is thirty seconds wide and starts only at a rotation they did not
// cause, while the admin's window was every refresh they ever made. Outside the window nothing
// changes: the family still dies and the audit row is still written.
//
// Nothing is written here. No rotation, no revocation, no new ledger row, no new jti, no audit row.
// The successor already exists and is still live; this only re-signs a JWT naming it, with that
// row's own expiry rather than a recomputed one, so the answer cannot extend anything.
func (s *Service) resumeLostRotation(ctx context.Context, row sqlc.RefreshToken) (*LoginResult, bool, error) {
	if row.ReplacedBy == nil || row.RevokedAt == nil || time.Since(*row.RevokedAt) > rotationGrace {
		return nil, false, nil
	}

	successor, err := s.queries.GetRefreshToken(ctx, *row.ReplacedBy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// The successor was pruned or never landed. Not a lost response, so the caller's
			// replay path takes it from here.
			return nil, false, nil
		}
		// Deliberately answered rather than passed through. Falling through on a failed read would
		// revoke a family and record a stolen token because the database hiccuped, and a
		// destructive answer is the wrong default for "we do not know".
		slog.Error("reading a spent token's successor failed", slog.Any("err", err))
		return nil, true, fmt.Errorf("get successor refresh token: %w", err)
	}

	now := time.Now()
	if successor.RevokedAt != nil || successor.ExpiresAt.Before(now) || successor.FamilyExpiresAt.Before(now) {
		// The successor is dead too, which is a chain someone kept rotating, not one response
		// that went missing thirty seconds ago.
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

// Logout revokes every token in the presented token's family.
//
// It returns nothing. A logout that reports failure gives a caller something to probe with, and
// there is nothing useful for them to do with the answer either way: the handler clears the
// cookie regardless, so from the browser's side the session is over even if the ledger write
// failed. A stale live row is bounded by the token's own seven-day expiry.
//
// The revoke goes through revokeFamily, which takes the family's advisory lock, rather than
// running the family UPDATE on its own. Signing out in one tab while another is mid-refresh is
// exactly the race the lock exists for: an UPDATE cannot see the successor row a rotation
// inserts after the UPDATE's own statement began, so an unlocked revoke can leave that successor
// alive in a family it has just killed.
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
		// A token with no ledger row is the ordinary case: it was already spent, or its family
		// was revoked, and there is nothing left to revoke. Anything else means the lookup itself
		// failed, and the caller cannot be told -- logout answers the same way regardless. Without
		// this line that failure leaves no trace at all, while the caller sees a cleared cookie
		// and a success, and the session it asked to end stays live until its own expiry.
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

// rotate spends the presented token and issues its successor as one transaction, under the
// family's advisory lock. Both halves of that matter and for different reasons.
//
// The transaction is what makes spending atomic: a crash between the two now leaves the
// presented token still live, so the client's next attempt with it simply works. The previous
// ordering argument -- revoke first, because a crash between them costs a re-login while the
// reverse leaves two live tokens -- no longer applies, because there is no longer an in-between
// state to crash in.
//
// The lock is what orders this transaction against a family revoke running at the same time. A
// revoke cannot revoke a row that does not exist yet, and an UPDATE's scan cannot see a row
// inserted after its statement began, so without the lock a family revoke racing this function
// can miss the successor and leave it live in a family it has just killed.
//
// The revoke is also what claims the token, which is why its row count is read rather than
// discarded. The RevokedAt check in Refresh cannot do that job: two requests carrying the same
// live token can both pass it, because neither has written anything yet. The UPDATE settles it
// instead, by matching only a row that is still unrevoked (see RevokeRefreshToken). Exactly one
// of the two changes a row.
func (s *Service) rotate(ctx context.Context, admin sqlc.AdminUser, jti, familyID uuid.UUID, familyExpiresAt time.Time) (*LoginResult, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin token rotation: %w", err)
	}
	// Load-bearing, not hygiene. This is what releases the family lock on every path that does not
	// commit, including the one where the token was already spent -- and on that path Refresh goes
	// straight on to revokeFamilyAsReplay, which takes the same lock on another connection. Without
	// the rollback here that call waits on a lock this function still holds, and the request hangs
	// until its deadline.
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

	// The successor's jti is minted here rather than inside issueTokenPair because the revoke
	// below writes it into replaced_by, in the same statement that spends the presented token. A
	// spent row therefore always names its successor, which is what lets Refresh tell a rotation
	// whose response was lost from a genuine replay.
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

	// familyExpiresAt is carried forward from the presented row, never recomputed. Recomputing it
	// is what made the seven days an idle timeout instead of a session lifetime.
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

// revokeFamilyAsReplay kills every token descended from the same login and records the detection.
// Two paths reach it: a token whose ledger row was already revoked, and a token another request
// spent while this one was working. Both mean two parties held one token, and neither tells us
// which of the two is the one asking now, so both lose the session.
//
// The audit row records the detection, which happened, and not the revocation, which may not have.
// A failed revoke shows up only in the error log, so the row is not proof that the family died.
func (s *Service) revokeFamilyAsReplay(ctx context.Context, row sqlc.RefreshToken, ip, userAgent string) {
	if err := s.revokeFamily(ctx, row.FamilyID); err != nil {
		slog.Error("revoking refresh token family failed", slog.Any("err", err))
	}
	s.audit.Record(ctx, auditsvc.EventTokenReuse, &row.AdminID, ip, userAgent)
}

// revokeFamily revokes every unrevoked token in one family, under that family's advisory lock.
// The lock is the whole reason this needs a transaction of its own. A rotation of a live token in
// the same family can be running right now, and the UPDATE below cannot see a successor row the
// rotation inserts after the UPDATE's own statement began -- it would revoke everything it could
// see and leave that successor alive in a family this call has just declared compromised. Taking
// the lock first means whichever of the two writers arrives second starts after the other has
// committed, and so sees its rows.
func (s *Service) revokeFamily(ctx context.Context, familyID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin family revoke: %w", err)
	}
	// Releases the family lock on every path that does not commit. Another writer on this family
	// is blocked behind it until then.
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

// issueTokenPair signs a new access and refresh token and records the refresh token in the
// ledger under familyID, through whichever queries handle q is. A rotation passes its
// transaction-bound handle, so the insert commits with the revoke that preceded it; a login
// passes the pool-bound one. A login also passes a fresh familyID, where a rotation passes the
// one the presented token already belonged to, which is what lets replay revoke the whole chain.
//
// jti and familyExpiresAt are supplied by the caller for the same reason familyID is. A rotation
// has already written the successor's jti into the predecessor's replaced_by, and has already read
// the family's deadline off the row it spent; both have to be the values this function uses, not
// fresh ones it invents.
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

// IsAccountLocked reports whether err is the backoff failure Login returns.
func IsAccountLocked(err error) bool {
	return errors.Is(err, errAccountLocked)
}
