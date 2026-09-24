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
	authhandler "landing-api/internal/http/handlers/auth"
	leadhandler "landing-api/internal/http/handlers/lead"
	"landing-api/internal/http/models"
	"landing-api/internal/http/routes"
	"landing-api/internal/service/audit"
	"landing-api/internal/service/auth"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
	"landing-api/internal/testsupport"
	"landing-api/internal/utils/secure"
)

// Shared by every test in this package, so a token from one file validates in another.
const (
	testJWTSecret           = "lead-handler-test-secret-32-bytes!" //nolint:gosec // fixture value for tests, not a real secret
	testAccessExpireMinutes = 15
	testRefreshExpireDays   = 7
	testSessionMaxDays      = 30
)

func newTestTokenService() *secure.TokenService {
	return secure.NewTokenService(testJWTSecret, testAccessExpireMinutes, testRefreshExpireDays, testSessionMaxDays)
}

// validRequest passes every check. Each case below breaks exactly one property.
func validRequest() models.CreateLeadRequest {
	return models.CreateLeadRequest{
		Name:      "Bat",
		Email:     "bat@example.mn",
		Message:   "Sain baina uu, ta ямар нэгэн зүйл асуухыг хүсэж байна.",
		Locale:    "mn",
		ElapsedMs: 2500,
	}
}

// newApp builds the real middleware chain against a fresh database, so the limiters and CORS are tested too.
func newApp(t *testing.T) (*fiber.App, *testsupport.DB, *secure.TokenService) {
	t.Helper()

	db := testsupport.Fresh(t)
	svc := lead.New(db.Queries, notify.NewLogger())
	tokenService := newTestTokenService()
	h := &handlers.Handlers{
		Lead: leadhandler.New(svc),
		Auth: authhandler.New(auth.New(db.Pool, db.Queries, tokenService, audit.New(db.Queries)), false),
	}

	app := fiber.New()
	routes.Setup(app, h, "http://localhost:5173", tokenService, false, "", nil)

	return app, db, tokenService
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

	app, db, _ := newApp(t)
	client := testkit.NewClient(t, fiberkit.Doer(app))

	client.PostJSON("/api/leads", validRequest()).Status(http.StatusOK)

	if got := leadCount(t, db); got != 1 {
		t.Fatalf("rows = %d, want 1", got)
	}
}

// A filled honeypot and a too-fast submission must look the same to the caller.
func TestCreateRejectsHoneypotAndTimingWithTheSameMessage(t *testing.T) {
	t.Parallel()

	honeypotApp, honeypotDB, _ := newApp(t)
	honeypotReq := validRequest()
	honeypotReq.HoneypotURL = "x"
	honeypotRes := testkit.NewClient(t, fiberkit.Doer(honeypotApp)).
		PostJSON("/api/leads", honeypotReq).Status(http.StatusBadRequest)

	if got := leadCount(t, honeypotDB); got != 0 {
		t.Fatalf("honeypot case: rows = %d, want 0", got)
	}

	timingApp, timingDB, _ := newApp(t)
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

	app, db, _ := newApp(t)
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
