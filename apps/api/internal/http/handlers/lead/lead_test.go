package leadhandler_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/tanasoft1/testkit"
	"github.com/tanasoft1/testkit/fiberkit"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/handlers"
	leadhandler "landing-api/internal/http/handlers/lead"
	"landing-api/internal/http/models"
	"landing-api/internal/http/routes"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
	"landing-api/internal/testsupport"
)

// validRequest clears every check this handler applies: field shape, the honeypot, and the
// timing floor. Each case below starts here and breaks exactly one property.
func validRequest() models.CreateLeadRequest {
	return models.CreateLeadRequest{
		Name:      "Bat",
		Email:     "bat@example.mn",
		Message:   "Sain baina uu, ta ямар нэгэн зүйл асуухыг хүсэж байна.",
		Locale:    "mn",
		ElapsedMs: 2500,
	}
}

// newApp builds the real middleware chain (routes.Setup, not a bare handler call) against its
// own pristine database, so the rate limiter, CORS and the rest of production wiring are
// exercised too, not just Handler.Create in isolation. notify.NewLogger is used instead of SES:
// no AWS account is available here, and the log driver's Lead never returns an error, so it
// never masks a real failure the way a misconfigured SES client's silence would.
func newApp(t *testing.T) (*fiber.App, *testsupport.DB) {
	t.Helper()

	db := testsupport.Fresh(t)
	svc := lead.New(db.Queries, notify.NewLogger())
	h := &handlers.Handlers{Lead: leadhandler.New(svc)}

	app := fiber.New()
	routes.Setup(app, h, "http://localhost:5173")

	return app, db
}

func leadCount(t *testing.T, db *testsupport.DB) int {
	t.Helper()

	rows, err := db.Queries.ListLeads(context.Background(), sqlc.ListLeadsParams{Limit: 100})
	if err != nil {
		t.Fatalf("ListLeads: %v", err)
	}
	return len(rows)
}

func TestCreateAcceptsAValidSubmission(t *testing.T) {
	t.Parallel()

	app, db := newApp(t)
	client := testkit.NewClient(t, fiberkit.Doer(app))

	client.PostJSON("/api/leads", validRequest()).Status(http.StatusOK)

	if got := leadCount(t, db); got != 1 {
		t.Fatalf("rows = %d, want 1", got)
	}
}

// The property under test: a filled honeypot and a too-fast submission must be indistinguishable
// to the caller. Both are asserted in one test, side by side, specifically so a future change
// that special-cases one of them shows up as this test failing, rather than as two separate tests
// that merely happen to agree by coincidence.
func TestCreateRejectsHoneypotAndTimingWithTheSameMessage(t *testing.T) {
	t.Parallel()

	honeypotApp, honeypotDB := newApp(t)
	honeypotReq := validRequest()
	honeypotReq.HoneypotURL = "x"
	honeypotRes := testkit.NewClient(t, fiberkit.Doer(honeypotApp)).
		PostJSON("/api/leads", honeypotReq).Status(http.StatusBadRequest)

	if got := leadCount(t, honeypotDB); got != 0 {
		t.Fatalf("honeypot case: rows = %d, want 0", got)
	}

	timingApp, timingDB := newApp(t)
	timingReq := validRequest()
	timingReq.ElapsedMs = 500
	timingRes := testkit.NewClient(t, fiberkit.Doer(timingApp)).
		PostJSON("/api/leads", timingReq).Status(http.StatusBadRequest)

	if got := leadCount(t, timingDB); got != 0 {
		t.Fatalf("timing case: rows = %d, want 0", got)
	}

	var honeypotBody, timingBody models.ErrorResponse
	honeypotRes.Decode(&honeypotBody)
	timingRes.Decode(&timingBody)

	if honeypotBody.Message == "" {
		t.Fatal("honeypot rejection carried no message")
	}
	if honeypotBody.Message != timingBody.Message {
		t.Fatalf("honeypot message %q != timing message %q; a bot can tell which check tripped",
			honeypotBody.Message, timingBody.Message)
	}
}

func TestCreateRejectsInvalidEmailAndNamesTheField(t *testing.T) {
	t.Parallel()

	app, db := newApp(t)
	req := validRequest()
	req.Email = "nope"

	res := testkit.NewClient(t, fiberkit.Doer(app)).PostJSON("/api/leads", req).Status(http.StatusBadRequest)

	var body models.ErrorResponse
	res.Decode(&body)
	if !strings.Contains(body.Message, "Имэйл") {
		t.Fatalf("message = %q, want it to name Имэйл", body.Message)
	}

	if got := leadCount(t, db); got != 0 {
		t.Fatalf("rows = %d, want 0", got)
	}
}
