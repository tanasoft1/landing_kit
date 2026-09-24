package notify

import (
	"context"
	"log/slog"
)

type logger struct{}

// NewLogger is the development notifier. conf.Load refuses it in production.
func NewLogger() Notifier { return logger{} }

func (logger) Lead(_ context.Context, l LeadMessage) error {
	// l.Message is visitor free text, so it stays out of the logs.
	slog.Info("lead received",
		slog.String("name", l.Name),
		slog.String("email", l.Email),
		slog.String("locale", l.Locale),
		slog.String("source_page", l.SourcePage))
	return nil
}
