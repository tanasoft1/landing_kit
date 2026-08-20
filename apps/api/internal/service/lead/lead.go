package lead

import (
	"context"
	"fmt"
	"log/slog"
	"net/netip"

	"github.com/google/uuid"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	"landing-api/internal/service/notify"
)

type Service struct {
	q        *sqlc.Queries
	notifier notify.Notifier
}

func New(q *sqlc.Queries, notifier notify.Notifier) *Service {
	return &Service{q: q, notifier: notifier}
}

type Input struct {
	Name       string
	Email      string
	Message    string
	Locale     string
	SourcePage string
	IP         string
	UserAgent  string
}

// Create stores the lead, then notifies. In that order, and the notification's error is logged
// rather than returned: the row is already committed, and failing the request would tell a real
// visitor their message did not arrive when it did. A mail outage must not look like a broken form.
func (s *Service) Create(ctx context.Context, in Input) error {
	// *netip.Addr because that is what SQLC generated for the `inet` column: psyfint's overrides
	// do not cover `inet`, so SQLC picked it, and it is the better type here anyway since a client
	// address has no mask.
	//
	// The nil check is load-bearing, not defensive habit. Postgres rejects an empty string bound
	// to an inet column with SQLSTATE 22P02, `invalid input syntax for type inet: ""`, verified
	// against a live server. Fiber's c.IP() returns "" whenever ProxyHeader names a header that
	// does not arrive (see conf.ServerConfig.ProxyHeader), so passing it straight through turns
	// every submission behind a misconfigured proxy into a 500 from a SQL error instead of a
	// stored lead with a blank IP. netip.ParseAddr("") returns an error, so this leaves it NULL.
	var ip *netip.Addr
	if parsed, err := netip.ParseAddr(in.IP); err == nil {
		ip = &parsed
	}

	params := sqlc.CreateLeadParams{
		ID:      uuid.New(),
		Name:    in.Name,
		Email:   in.Email,
		Message: in.Message,
		Locale:  in.Locale,
		Ip:      ip,
	}
	if in.SourcePage != "" {
		params.SourcePage = &in.SourcePage
	}
	if in.UserAgent != "" {
		params.UserAgent = &in.UserAgent
	}

	if _, err := s.q.CreateLead(ctx, params); err != nil {
		return fmt.Errorf("create lead: %w", err)
	}

	if err := s.notifier.Lead(ctx, notify.LeadMessage{
		Name:       in.Name,
		Email:      in.Email,
		Message:    in.Message,
		Locale:     in.Locale,
		SourcePage: in.SourcePage,
	}); err != nil {
		slog.Error("lead notification failed", slog.Any("err", err), slog.String("email", in.Email))
	}
	return nil
}

// List returns leads newest-first as models.RsLead. limit and offset are used exactly as given:
// capping the page size is the caller's job (see the clamp in
// internal/http/handlers/lead.Handler.List), because only the caller knows whether limit arrived
// from a trusted source or an admin-supplied query string.
func (s *Service) List(ctx context.Context, limit, offset int32) ([]models.RsLead, error) {
	rows, err := s.q.ListLeads(ctx, sqlc.ListLeadsParams{Limit: limit, Offset: offset})
	if err != nil {
		return nil, fmt.Errorf("list leads: %w", err)
	}

	leads := make([]models.RsLead, 0, len(rows))
	for _, row := range rows {
		lead := models.RsLead{
			ID:        row.ID,
			Name:      row.Name,
			Email:     row.Email,
			Message:   row.Message,
			Locale:    row.Locale,
			CreatedAt: row.CreatedAt,
		}
		if row.SourcePage != nil {
			lead.SourcePage = *row.SourcePage
		}
		if row.Ip != nil {
			lead.IP = row.Ip.String()
		}
		if row.UserAgent != nil {
			lead.UserAgent = *row.UserAgent
		}
		leads = append(leads, lead)
	}
	return leads, nil
}
