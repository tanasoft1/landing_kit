// Package notify delivers one notification per lead, through SES or a logger.
package notify

import "context"

// LeadMessage is what the owner is told. It is not the database row, so a new column cannot leak
// into an email.
type LeadMessage struct {
	Name       string
	Email      string
	Message    string
	Locale     string
	SourcePage string
}

// Notifier delivers one lead notification. Callers must not fail the request on its error.
type Notifier interface {
	Lead(ctx context.Context, l LeadMessage) error
}
