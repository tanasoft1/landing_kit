package authhandler_test

import (
	"bytes"
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
	"landing-api/internal/service/audit"
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
	// csrfHeader is required on refresh and logout, as the panel's fetch sends it.
	csrfHeader = "X-Requested-With"
)

// newApp builds the real middleware chain, so the limiters and CORS are tested too.
func newApp(t *testing.T) (*fiber.App, *testsupport.DB, *secure.TokenService) {
	t.Helper()

	db := testsupport.Fresh(t)
	tokenService := secure.NewTokenService(testJWTSecret, 15, 7, 30)
	h := &handlers.Handlers{
		Lead: leadhandler.New(lead.New(db.Queries, notify.NewLogger())),
		// No TLS in tests, so a Secure cookie would not be stored.
		Auth: authhandler.New(auth.New(db.Pool, db.Queries, tokenService, audit.New(db.Queries)), false),
	}

	app := fiber.New()
	routes.Setup(app, h, "http://localhost:5173", tokenService, false, "", nil)

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

// authData is models.SuccessResponse with Data typed as models.RsAuth.
type authData struct {
	Success bool          `json:"success"`
	Data    models.RsAuth `json:"data"`
}

// refreshCookie pulls the refresh cookie out of a response, or fails the test.
func refreshCookie(t *testing.T, res *testkit.Response) *http.Cookie {
	t.Helper()

	for _, c := range (&http.Response{Header: res.Header}).Cookies() {
		if c.Name == authhandler.RefreshCookieName {
			return c
		}
	}

	t.Fatalf("response set no %s cookie", authhandler.RefreshCookieName)
	return nil
}

// refreshCookieHeader renders a token as a request Cookie header, name and value only, like a browser.
func refreshCookieHeader(token string) string {
	return authhandler.RefreshCookieName + "=" + token
}

func TestLoginSucceedsAndSetsRefreshCookie(t *testing.T) {
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
	if body.Data.AccessToken == "" {
		t.Fatal("login response carried an empty access token")
	}
	if _, err := tokenService.ValidateAccessToken(body.Data.AccessToken); err != nil {
		t.Fatalf("access token invalid: %v", err)
	}

	// The refresh token must never appear in the body, where a script could read it.
	if bytes.Contains(res.Body, []byte("refresh_token")) {
		t.Fatalf("login body still carries a refresh token: %s", res.Body)
	}

	cookie := refreshCookie(t, res)
	if cookie.Value == "" {
		t.Fatal("refresh cookie is empty")
	}
	if !cookie.HttpOnly {
		t.Error("refresh cookie is not HttpOnly, so a script can read it")
	}
	if cookie.Path != "/api/auth" {
		t.Errorf("refresh cookie Path = %q, want /api/auth, or every admin request carries it", cookie.Path)
	}
	if cookie.SameSite != http.SameSiteStrictMode {
		t.Errorf("refresh cookie SameSite = %v, want Strict", cookie.SameSite)
	}
}

// A wrong password and an unknown email must get the same status and body.
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

	refreshRes := testkit.NewClient(t, fiberkit.Doer(app)).
		With("Cookie", refreshCookieHeader(refreshCookie(t, loginRes).Value)).
		With(csrfHeader, "XMLHttpRequest").
		PostJSON("/api/auth/refresh", nil).
		Status(http.StatusOK)
	var refreshBody authData
	refreshRes.Decode(&refreshBody)

	if refreshBody.Data.AccessToken == "" {
		t.Fatal("refresh returned no access token")
	}
	if _, err := tokenService.ValidateAccessToken(refreshBody.Data.AccessToken); err != nil {
		t.Fatalf("refreshed access token invalid: %v", err)
	}
	if rotated := refreshCookie(t, refreshRes); rotated.Value == "" {
		t.Fatal("refresh did not set a replacement cookie")
	}
}

func TestRefreshRejectsAccessTokenAsRefreshToken(t *testing.T) {
	t.Parallel()

	app, db, tokenService := newApp(t)
	seedAdmin(t, db)

	access, err := tokenService.GenerateAccessToken(uuid.New(), testAdminEmail)
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	testkit.NewClient(t, fiberkit.Doer(app)).
		With("Cookie", refreshCookieHeader(access)).
		With(csrfHeader, "XMLHttpRequest").
		PostJSON("/api/auth/refresh", nil).
		Status(http.StatusUnauthorized)
}
