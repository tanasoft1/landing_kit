// Package audit records admin authentication events. It is deliberately the thinnest service
// here: an audit write must never be the reason a request fails.
package audit

import (
	"context"
	"log/slog"

	"github.com/google/uuid"

	"landing-api/internal/db/sqlc"
)

// The events slice 1 records. token_reuse_detected is the important one: it is the only signal
// that a refresh token was stolen, and without it a family revocation looks to the admin like a
// random logout.
const (
	EventLoginSuccess = "login_success"
	EventLoginFailed  = "login_failed"
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
	// WithoutCancel because the request's context may already be cancelled -- a client that
	// disconnects mid-login still generated an event worth keeping, and that is doubly true of
	// the reuse-detection path, where an attacker hanging up is not a reason to lose the record.
	ctx = context.WithoutCancel(ctx)

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
