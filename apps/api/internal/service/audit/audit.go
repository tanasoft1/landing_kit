// Package audit records admin authentication events. An audit write never fails a request.
package audit

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"landing-api/internal/db/sqlc"
)

// auditWriteTimeout stays under the 10 second shutdown timeout in main.
const auditWriteTimeout = 5 * time.Second

// Audit events. token_reuse_detected is the only sign a refresh token was stolen. A run of
// login_locked rows is an attack in progress.
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

// Record writes one audit row and logs a failure. adminID is nil when no account was looked up.
func (s *Service) Record(ctx context.Context, event string, adminID *uuid.UUID, ip, userAgent string) {
	// WithoutCancel keeps the row when the client hangs up. It also drops the deadline, so add one back.
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

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
