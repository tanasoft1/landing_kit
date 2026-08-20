// Package notify delivers one notification per lead through a driver chosen at startup: SES for
// real delivery, or a logger for development and any environment where the site owner should not
// be emailed. See conf.NotifyConfig for how the driver is selected and why "log" is refused in
// production.
package notify

import "context"

// LeadMessage is what the owner is told about. Deliberately not the database row: a notifier has
// no business with an id, an IP or a timestamp, and passing the row would let a future field leak
// into an email nobody meant to send.
type LeadMessage struct {
	Name       string
	Email      string
	Message    string
	Locale     string
	SourcePage string
}

// Notifier delivers one lead notification.
//
// An error here must never fail the request that produced it. The lead is already committed by
// the time this runs, and losing it to a mail outage is strictly worse than a missing email.
// internal/service/lead is where that rule is enforced; this interface only reports.
type Notifier interface {
	Lead(ctx context.Context, l LeadMessage) error
}
