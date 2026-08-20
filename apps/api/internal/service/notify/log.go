package notify

import (
	"context"
	"log/slog"
)

type logger struct{}

// NewLogger is the development notifier: it makes `pnpm dev` work with no AWS account. It is
// refused in production by conf.Load, because a driver that silently succeeds is the one way a
// misconfigured deploy loses every notification without an error.
func NewLogger() Notifier { return logger{} }

func (logger) Lead(_ context.Context, l LeadMessage) error {
	// l.Message is deliberately not logged. It is visitor-submitted free text, and logs are the
	// one place it would be copied to that nobody audits.
	slog.Info("lead received",
		slog.String("name", l.Name),
		slog.String("email", l.Email),
		slog.String("locale", l.Locale),
		slog.String("source_page", l.SourcePage))
	return nil
}
