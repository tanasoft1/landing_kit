package auth_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	"landing-api/internal/service/audit"
	"landing-api/internal/service/auth"
	"landing-api/internal/testsupport"
	"landing-api/internal/utils"
	"landing-api/internal/utils/secure"
)

const (
	testPassword  = "correct-horse-battery-staple"
	testSecret    = "auth-service-test-secret-32-bytes!!" //nolint:gosec // fixture value for tests, not a real secret
	testIP        = "127.0.0.1"
	testUserAgent = "test-agent"
)

func setupAuth(t *testing.T) (*testsupport.DB, *auth.Service, *secure.TokenService) {
	t.Helper()

	tdb := testsupport.Fresh(t)
	tokenSvc := secure.NewTokenService(testSecret, 15, 7, 30)
	svc := auth.New(tdb.Pool, tdb.Queries, tokenSvc, audit.New(tdb.Queries))

	return tdb, svc, tokenSvc
}

func seedAdmin(t *testing.T, tdb *testsupport.DB, email string) uuid.UUID {
	t.Helper()

	hash, err := utils.HashPassword(testPassword)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	admin, err := tdb.Queries.CreateAdmin(context.Background(), sqlc.CreateAdminParams{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: hash,
	})
	if err != nil {
		t.Fatalf("seed admin: %v", err)
	}

	return admin.ID
}

func TestLogin(t *testing.T) {
	t.Parallel()

	tdb, svc, tokenSvc := setupAuth(t)
	ctx := context.Background()
	adminID := seedAdmin(t, tdb, "login@test.mn")

	t.Run("returns valid token pair and profile", func(t *testing.T) {
		t.Parallel()

		resp, err := svc.Login(ctx, &models.RqLogin{Email: "login@test.mn", Password: testPassword}, testIP, testUserAgent)
		if err != nil {
			t.Fatalf("Login: %v", err)
		}

		claims, err := tokenSvc.ValidateAccessToken(resp.AccessToken)
		if err != nil {
			t.Fatalf("access token invalid: %v", err)
		}
		if claims.AdminID != adminID {
			t.Errorf("access token admin_id = %v, want %v", claims.AdminID, adminID)
		}

		if _, err := tokenSvc.ValidateRefreshToken(resp.RefreshToken); err != nil {
			t.Fatalf("refresh token invalid: %v", err)
		}

		if resp.Admin.Email != "login@test.mn" {
			t.Errorf("profile email = %q, want login@test.mn", resp.Admin.Email)
		}
	})

	t.Run("wrong password and unknown email return the identical error", func(t *testing.T) {
		t.Parallel()

		_, wrongPassErr := svc.Login(ctx, &models.RqLogin{Email: "login@test.mn", Password: "wrong-password"}, testIP, testUserAgent)
		_, unknownEmailErr := svc.Login(ctx, &models.RqLogin{Email: "nobody@test.mn", Password: testPassword}, testIP, testUserAgent)

		if wrongPassErr == nil || !auth.IsInvalidCredentials(wrongPassErr) {
			t.Fatalf("wrong password err = %v, want invalid credentials", wrongPassErr)
		}
		if unknownEmailErr == nil || !auth.IsInvalidCredentials(unknownEmailErr) {
			t.Fatalf("unknown email err = %v, want invalid credentials", unknownEmailErr)
		}
		if wrongPassErr.Error() != unknownEmailErr.Error() {
			t.Fatalf("messages differ: wrong password = %q, unknown email = %q; an attacker could tell them apart",
				wrongPassErr.Error(), unknownEmailErr.Error())
		}
	})
}

func TestRefresh(t *testing.T) {
	t.Parallel()

	tdb, svc, tokenSvc := setupAuth(t)
	ctx := context.Background()
	adminID := seedAdmin(t, tdb, "refresh@test.mn")

	t.Run("valid refresh token returns a new pair", func(t *testing.T) {
		t.Parallel()

		// Through Login, which writes the ledger row a refresh token needs.
		login, err := svc.Login(ctx, &models.RqLogin{Email: "refresh@test.mn", Password: testPassword}, testIP, testUserAgent)
		if err != nil {
			t.Fatalf("Login: %v", err)
		}

		resp, err := svc.Refresh(ctx, login.RefreshToken, testIP, testUserAgent)
		if err != nil {
			t.Fatalf("Refresh: %v", err)
		}
		if _, err := tokenSvc.ValidateAccessToken(resp.AccessToken); err != nil {
			t.Fatalf("new access token invalid: %v", err)
		}
		if _, err := tokenSvc.ValidateRefreshToken(resp.RefreshToken); err != nil {
			t.Fatalf("new refresh token invalid: %v", err)
		}
	})

	t.Run("access token rejected as refresh token", func(t *testing.T) {
		t.Parallel()

		access, err := tokenSvc.GenerateAccessToken(adminID, "refresh@test.mn")
		if err != nil {
			t.Fatalf("GenerateAccessToken: %v", err)
		}

		_, err = svc.Refresh(ctx, access, testIP, testUserAgent)
		if err == nil || !auth.IsInvalidToken(err) {
			t.Fatalf("err = %v, want invalid token", err)
		}
	})

	t.Run("garbage token returns invalid token", func(t *testing.T) {
		t.Parallel()

		_, err := svc.Refresh(ctx, "not-a-jwt", testIP, testUserAgent)
		if err == nil || !auth.IsInvalidToken(err) {
			t.Fatalf("err = %v, want invalid token", err)
		}
	})

	t.Run("refresh token with no ledger row returns invalid token", func(t *testing.T) {
		t.Parallel()

		refresh, _, err := tokenSvc.GenerateRefreshToken(uuid.New(), uuid.New(), time.Now().Add(30*24*time.Hour))
		if err != nil {
			t.Fatalf("GenerateRefreshToken: %v", err)
		}

		_, err = svc.Refresh(ctx, refresh, testIP, testUserAgent)
		if err == nil || !auth.IsInvalidToken(err) {
			t.Fatalf("err = %v, want invalid token", err)
		}
	})
}
