package authhandler_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/tanasoft1/testkit"
	"github.com/tanasoft1/testkit/fiberkit"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/handlers"
	authhandler "landing-api/internal/http/handlers/auth"
	leadhandler "landing-api/internal/http/handlers/lead"
	"landing-api/internal/http/models"
	"landing-api/internal/http/routes"
	"landing-api/internal/service/auth"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
	"landing-api/internal/testsupport"
	"landing-api/internal/utils"
	"landing-api/internal/utils/secure"
)

const (
	//nolint:gosec // fixture value for tests, not a real secret
	testJWTSecret  = "auth-handler-test-secret-32-bytes!!"
	testPassword   = "correct-horse-battery-staple"
	testAdminEmail = "admin@example.mn"
)

// newApp builds the real middleware chain (routes.Setup), so the login rate limiter, CORS and
// the rest of production wiring are exercised too, not just Handler.Login/Refresh in isolation.
func newApp(t *testing.T) (*fiber.App, *testsupport.DB, *secure.TokenService) {
	t.Helper()

	db := testsupport.Fresh(t)
	tokenService := secure.NewTokenService(testJWTSecret, 1, 7)
	h := &handlers.Handlers{
		Lead: leadhandler.New(lead.New(db.Queries, notify.NewLogger())),
		Auth: authhandler.New(auth.New(db.Queries, tokenService)),
	}

	app := fiber.New()
	routes.Setup(app, h, "http://localhost:5173", tokenService)

	return app, db, tokenService
}

func seedAdmin(t *testing.T, db *testsupport.DB) {
	t.Helper()

	hash, err := utils.HashPassword(testPassword)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	if _, err := db.Queries.CreateAdmin(context.Background(), sqlc.CreateAdminParams{
		ID:           uuid.New(),
		Email:        testAdminEmail,
		PasswordHash: hash,
	}); err != nil {
		t.Fatalf("seed admin: %v", err)
	}
}

// authData mirrors models.SuccessResponse with Data typed as models.RsAuth, so a test can decode
// straight into the token pair instead of re-decoding an `any`.
type authData struct {
	Success bool          `json:"success"`
	Data    models.RsAuth `json:"data"`
}

func TestLoginSucceedsAndReturnsTokenPair(t *testing.T) {
	t.Parallel()

	app, db, tokenService := newApp(t)
	seedAdmin(t, db)

	res := testkit.NewClient(t, fiberkit.Doer(app)).
		PostJSON("/api/auth/login", models.RqLogin{Email: testAdminEmail, Password: testPassword}).
		Status(http.StatusOK)

	var body authData
	res.Decode(&body)
	if !body.Success {
		t.Fatal("Success = false, want true")
	}
	if body.Data.AccessToken == "" || body.Data.RefreshToken == "" {
		t.Fatal("login response carried an empty token")
	}
	if _, err := tokenService.ValidateAccessToken(body.Data.AccessToken); err != nil {
		t.Fatalf("access token invalid: %v", err)
	}
}

// The property under test: a caller who tries a registered email with the wrong password, and a
// caller who tries an email that was never registered, get the SAME status and the SAME body.
// Either differing would let an attacker enumerate registered emails.
func TestLoginWrongPasswordAndUnknownEmailReturnTheSameMessage(t *testing.T) {
	t.Parallel()

	app, db, _ := newApp(t)
	seedAdmin(t, db)

	wrongPassRes := testkit.NewClient(t, fiberkit.Doer(app)).
		PostJSON("/api/auth/login", models.RqLogin{Email: testAdminEmail, Password: "wrong-password"}).
		Status(http.StatusUnauthorized)

	unknownEmailRes := testkit.NewClient(t, fiberkit.Doer(app)).
		PostJSON("/api/auth/login", models.RqLogin{Email: "nobody@example.mn", Password: testPassword}).
		Status(http.StatusUnauthorized)

	var wrongPassBody, unknownEmailBody models.ErrorResponse
	wrongPassRes.Decode(&wrongPassBody)
	unknownEmailRes.Decode(&unknownEmailBody)

	if wrongPassBody.Message == "" {
		t.Fatal("wrong password rejection carried no message")
	}
	if wrongPassBody != unknownEmailBody {
		t.Fatalf("wrong password body %+v != unknown email body %+v; an attacker can tell them apart",
			wrongPassBody, unknownEmailBody)
	}
}

func TestRefreshHappyPath(t *testing.T) {
	t.Parallel()

	app, db, tokenService := newApp(t)
	seedAdmin(t, db)

	loginRes := testkit.NewClient(t, fiberkit.Doer(app)).
		PostJSON("/api/auth/login", models.RqLogin{Email: testAdminEmail, Password: testPassword}).
		Status(http.StatusOK)
	var loginBody authData
	loginRes.Decode(&loginBody)

	refreshRes := testkit.NewClient(t, fiberkit.Doer(app)).
		PostJSON("/api/auth/refresh", models.RqRefreshToken{RefreshToken: loginBody.Data.RefreshToken}).
		Status(http.StatusOK)
	var refreshBody authData
	refreshRes.Decode(&refreshBody)

	if refreshBody.Data.AccessToken == "" {
		t.Fatal("refresh returned no access token")
	}
	if _, err := tokenService.ValidateAccessToken(refreshBody.Data.AccessToken); err != nil {
		t.Fatalf("refreshed access token invalid: %v", err)
	}
}

// An access token must not be usable where a refresh token is required -- the reverse of
// AuthMiddleware rejecting a refresh token as an access token, and the same reason: each token
// type is scoped to its own, different, lifetime.
func TestRefreshRejectsAccessTokenAsRefreshToken(t *testing.T) {
	t.Parallel()

	app, db, tokenService := newApp(t)
	seedAdmin(t, db)

	access, err := tokenService.GenerateAccessToken(uuid.New(), testAdminEmail)
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	testkit.NewClient(t, fiberkit.Doer(app)).
		PostJSON("/api/auth/refresh", models.RqRefreshToken{RefreshToken: access}).
		Status(http.StatusUnauthorized)
}
