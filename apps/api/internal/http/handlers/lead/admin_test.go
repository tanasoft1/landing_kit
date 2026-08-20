package leadhandler_test

import (
	"context"
	"net/http"
	"net/netip"
	"testing"

	"github.com/google/uuid"
	"github.com/tanasoft1/testkit"
	"github.com/tanasoft1/testkit/fiberkit"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	"landing-api/internal/testsupport"
)

func seedLead(t *testing.T, db *testsupport.DB, email string) {
	t.Helper()

	addr := netip.MustParseAddr("203.0.113.7")
	_, err := db.Queries.CreateLead(context.Background(), sqlc.CreateLeadParams{
		ID:      uuid.New(),
		Name:    "Bat",
		Email:   email,
		Message: "Sain baina uu, ta bental...",
		Locale:  "mn",
		Ip:      &addr,
	})
	if err != nil {
		t.Fatalf("seed lead: %v", err)
	}
}

func TestAdminLeadsRequiresAuthorization(t *testing.T) {
	t.Parallel()

	app, db, _ := newApp(t)
	seedLead(t, db, "bat@example.mn")

	testkit.NewClient(t, fiberkit.Doer(app)).Get("/api/admin/leads").Status(http.StatusUnauthorized)
}

func TestAdminLeadsReturnsSeededLeadWithValidToken(t *testing.T) {
	t.Parallel()

	app, db, tokenService := newApp(t)
	seedLead(t, db, "bat@example.mn")

	access, err := tokenService.GenerateAccessToken(uuid.New(), "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	res := testkit.NewClient(t, fiberkit.Doer(app)).
		With("Authorization", "Bearer "+access).
		Get("/api/admin/leads").
		Status(http.StatusOK)

	var body models.SuccessResponse
	res.Decode(&body)
	if !body.Success {
		t.Fatal("Success = false, want true")
	}

	leads, ok := body.Data.([]any)
	if !ok {
		t.Fatalf("Data = %T, want a list", body.Data)
	}
	if len(leads) != 1 {
		t.Fatalf("got %d leads, want 1", len(leads))
	}
	row, ok := leads[0].(map[string]any)
	if !ok {
		t.Fatalf("lead row = %T, want an object", leads[0])
	}
	if row["email"] != "bat@example.mn" {
		t.Errorf("lead email = %v, want bat@example.mn", row["email"])
	}
}

// A refresh token must not be accepted where an access token is required. Without this check, a
// refresh token -- which lives far longer, see conf.JWTConfig -- would silently extend the
// session window to its own, much longer, lifetime.
func TestAdminLeadsRejectsRefreshTokenAsAccessToken(t *testing.T) {
	t.Parallel()

	app, _, tokenService := newApp(t)

	refresh, err := tokenService.GenerateRefreshToken(uuid.New())
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}

	testkit.NewClient(t, fiberkit.Doer(app)).
		With("Authorization", "Bearer "+refresh).
		Get("/api/admin/leads").
		Status(http.StatusUnauthorized)
}

// The property under test: no matter how large a limit a caller asks for, at most MaxListLimit
// (200) rows come back. 205 leads are seeded specifically so the 200th and 205th cannot both be
// in the response -- if the clamp regressed to, say, "cap at 1000", this still passes; only
// clamping to exactly 200 or fewer does.
func TestAdminLeadsClampsAnOversizedLimit(t *testing.T) {
	t.Parallel()

	app, db, tokenService := newApp(t)
	for range 205 {
		seedLead(t, db, "bat@example.mn")
	}

	access, err := tokenService.GenerateAccessToken(uuid.New(), "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	res := testkit.NewClient(t, fiberkit.Doer(app)).
		With("Authorization", "Bearer "+access).
		Get("/api/admin/leads?limit=10000").
		Status(http.StatusOK)

	var body models.SuccessResponse
	res.Decode(&body)
	leads, ok := body.Data.([]any)
	if !ok {
		t.Fatalf("Data = %T, want a list", body.Data)
	}
	if len(leads) != 200 {
		t.Fatalf("got %d leads for limit=10000, want 200 (the clamp)", len(leads))
	}
}
