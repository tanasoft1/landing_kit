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

// Create stores the lead, then notifies. A notify error is only logged: the lead is saved, and a
// mail outage must not look like a broken form.
func (s *Service) Create(ctx context.Context, in Input) error {
	// An unparseable IP is stored as NULL. Postgres rejects "" for an inet column.
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

// List returns one page of leads, newest first, plus the total row count. The caller caps limit.
// The two queries use different snapshots, so Total can be slightly off.
func (s *Service) List(ctx context.Context, limit, offset int32) (*models.RsLeadPage, error) {
	rows, err := s.q.ListLeads(ctx, sqlc.ListLeadsParams{Limit: limit, Offset: offset})
	if err != nil {
		return nil, fmt.Errorf("list leads: %w", err)
	}

	total, err := s.q.CountLeads(ctx)
	if err != nil {
		return nil, fmt.Errorf("count leads: %w", err)
	}

	// Never nil: a nil slice marshals to null and breaks the client on an empty inbox.
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
	return &models.RsLeadPage{Items: leads, Total: total}, nil
}
