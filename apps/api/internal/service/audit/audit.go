// Package audit records admin authentication events. It is deliberately the thinnest service
// here: an audit write must never be the reason a request fails.
package audit

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"landing-api/internal/db/sqlc"
)

// auditWriteTimeout bounds the insert in Record. One row into a table carrying a single index is a
// single-digit-millisecond write, so five seconds is not a budget, it is a tripwire for a wedged
// database: nothing merely busy reaches it. It also stays under the 10 second
// ShutdownWithTimeout in cmd/main.go, so a stuck audit write cannot outlive a graceful shutdown.
const auditWriteTimeout = 5 * time.Second

// The events the admin auth path records. token_reuse_detected is the important one: it is the
// only signal that a refresh token was stolen, and without it a family revocation looks to the
// admin like a random logout.
// login_locked is separate from login_failed on purpose. A failed login is one person mistyping;
// a run of login_locked rows is somebody feeding an address failures fast enough to keep the
// backoff standing, which is an attack in progress and reads as one in the table.
const (
	EventLoginSuccess = "login_success"
	EventLoginFailed  = "login_failed"
	EventLoginLocked  = "login_locked"
	EventLogout       = "logout"
	EventTokenReuse   = "token_reuse_detected" //nolint:gosec // an event name written into the audit log, not a credential
)

type Service struct {
	queries *sqlc.Queries
}

func New(queries *sqlc.Queries) *Service {
	return &Service{queries: queries}
}

// Record writes one audit row. It returns nothing, on purpose: every caller is in the middle of
// handling a request whose outcome is already decided, and there is no sensible way for them to
// react to a failed insert beyond what this function already does.
//
// adminID is nil for a failed login against an email with no account.
func (s *Service) Record(ctx context.Context, event string, adminID *uuid.UUID, ip, userAgent string) {
	// Two decisions, not one. WithoutCancel drops the request's cancellation, because a client
	// that disconnects mid-login still generated an event worth keeping, and that is doubly true
	// of the reuse-detection path, where an attacker hanging up is not a reason to lose the
	// record. WithTimeout then puts a bound back, because WithoutCancel strips the request's
	// deadline along with its cancellation. Without that second half a wedged database turns "an
	// audit write must never fail a request" into "an audit write can hang one forever".
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), auditWriteTimeout)
	defer cancel()

	err := s.queries.CreateAuditLog(ctx, sqlc.CreateAuditLogParams{
		ID:        uuid.New(),
		AdminID:   adminID,
		Event:     event,
		Ip:        nilIfEmpty(ip),
		UserAgent: nilIfEmpty(userAgent),
	})
	if err != nil {
		slog.Error("audit write failed", slog.String("event", event), slog.Any("err", err))
	}
}

// nilIfEmpty stores NULL rather than an empty string, so "we did not capture this" and "this was
// blank" stay distinguishable in the table.
func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
