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

// The rule this pins: a notification failure must not fail Create, and the row must still be
// there afterwards. Losing a lead to a mail outage is the failure this ordering prevents.
func TestCreateSucceedsWhenNotifyFails(t *testing.T) {
	t.Parallel()
	db := testsupport.Fresh(t)
	notifier := &failing{}
	svc := lead.New(db.Queries, notifier)

	err := svc.Create(context.Background(), lead.Input{
		Name: "Bat", Email: "bat@example.mn", Message: "Sain baina uu, ta bental...", Locale: "mn",
		// A documentation-range address, so the value is obviously a fixture and never a real
		// client. Present so the assertion below can prove the inet column round-trips.
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
	// Asserts the inet round trip, which nothing before this point has exercised. SQLC chose
	// *netip.Addr for the column and pgx has to encode and decode it; a schema check and a
	// health check prove neither direction. If this ever fails on the read side while the write
	// succeeded, the encode and decode paths disagree.
	if rows[0].Ip == nil || rows[0].Ip.String() != "203.0.113.7" {
		t.Fatalf("Ip round-tripped as %v, want 203.0.113.7", rows[0].Ip)
	}
}
