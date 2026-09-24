package lead_test

import (
	"context"
	"errors"
	"testing"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
	"landing-api/internal/testsupport"
)

type failing struct{ calls int }

func (f *failing) Lead(context.Context, notify.LeadMessage) error {
	f.calls++
	return errors.New("ses is down")
}

// A notify failure must not fail Create, and the row must still be there.
func TestCreateSucceedsWhenNotifyFails(t *testing.T) {
	t.Parallel()
	db := testsupport.Fresh(t)
	notifier := &failing{}
	svc := lead.New(db.Queries, notifier)

	err := svc.Create(context.Background(), lead.Input{
		Name: "Bat", Email: "bat@example.mn", Message: "Sain baina uu, ta bental...", Locale: "mn",
		IP: "203.0.113.7",
	})
	if err != nil {
		t.Fatalf("Create returned %v, want nil despite the notifier failing", err)
	}
	if notifier.calls != 1 {
		t.Fatalf("notifier called %d times, want 1", notifier.calls)
	}

	rows, err := db.Queries.ListLeads(context.Background(), sqlc.ListLeadsParams{Limit: 10})
	if err != nil {
		t.Fatalf("ListLeads: %v", err)
	}
	if len(rows) != 1 || rows[0].Email != "bat@example.mn" {
		t.Fatalf("got %d rows (%+v), want 1 for bat@example.mn", len(rows), rows)
	}
	// The inet column must round-trip through *netip.Addr.
	if rows[0].Ip == nil || rows[0].Ip.String() != "203.0.113.7" {
		t.Fatalf("Ip round-tripped as %v, want 203.0.113.7", rows[0].Ip)
	}
}
