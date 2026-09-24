package secure_test

import (
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"landing-api/internal/utils/secure"
)

const testSecret = "test-secret-at-least-32-bytes-long"

// testFamilyDeadline is far enough out that the family clamp never applies.
func testFamilyDeadline() time.Time {
	return time.Now().Add(365 * 24 * time.Hour)
}

func TestAccessTokenRoundTrip(t *testing.T) {
	t.Parallel()

	svc := secure.NewTokenService(testSecret, 15, 7, 30)
	adminID := uuid.New()

	token, err := svc.GenerateAccessToken(adminID, "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	claims, err := svc.ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("ValidateAccessToken: %v", err)
	}
	if claims.AdminID != adminID {
		t.Errorf("AdminID = %v, want %v", claims.AdminID, adminID)
	}
	if claims.Email != "admin@example.mn" {
		t.Errorf("Email = %q, want %q", claims.Email, "admin@example.mn")
	}
	if claims.TokenType != secure.TokenTypeAccess {
		t.Errorf("TokenType = %q, want %q", claims.TokenType, secure.TokenTypeAccess)
	}
}

func TestRefreshTokenRoundTrip(t *testing.T) {
	t.Parallel()

	svc := secure.NewTokenService(testSecret, 15, 7, 30)
	adminID := uuid.New()

	jti := uuid.New()

	token, expiresAt, err := svc.GenerateRefreshToken(adminID, jti, testFamilyDeadline())
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}
	if expiresAt.IsZero() {
		t.Error("GenerateRefreshToken returned a zero expiry")
	}

	claims, err := svc.ValidateRefreshToken(token)
	if err != nil {
		t.Fatalf("ValidateRefreshToken: %v", err)
	}
	if claims.AdminID != adminID {
		t.Errorf("AdminID = %v, want %v", claims.AdminID, adminID)
	}
	if claims.TokenType != secure.TokenTypeRefresh {
		t.Errorf("TokenType = %q, want %q", claims.TokenType, secure.TokenTypeRefresh)
	}
	if claims.ID != jti.String() {
		t.Errorf("ID = %q, want %q", claims.ID, jti.String())
	}
}

func TestCrossTokenTypeIsRejectedBothWays(t *testing.T) {
	t.Parallel()

	svc := secure.NewTokenService(testSecret, 15, 7, 30)
	adminID := uuid.New()

	access, err := svc.GenerateAccessToken(adminID, "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}
	refresh, _, err := svc.GenerateRefreshToken(adminID, uuid.New(), testFamilyDeadline())
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
	}

	if _, err := svc.ValidateRefreshToken(access); err == nil {
		t.Error("ValidateRefreshToken accepted an access token, want error")
	}
	if _, err := svc.ValidateAccessToken(refresh); err == nil {
		t.Error("ValidateAccessToken accepted a refresh token, want error")
	}
}

func TestValidateRejectsWrongSecret(t *testing.T) {
	t.Parallel()

	issuer := secure.NewTokenService(testSecret, 15, 7, 30)
	verifier := secure.NewTokenService("a-completely-different-secret-value", 15, 7, 30)

	token, err := issuer.GenerateAccessToken(uuid.New(), "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}

	if _, err := verifier.ValidateAccessToken(token); err == nil {
		t.Error("ValidateAccessToken accepted a token signed with a different secret, want error")
	}
}

func TestValidateRejectsExpiredToken(t *testing.T) {
	t.Parallel()

	// Built directly with jwt: the service's expiry is in whole minutes, too coarse for this test.
	claims := &secure.Claims{
		AdminID:   uuid.New(),
		TokenType: secure.TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("sign expired token: %v", err)
	}

	svc := secure.NewTokenService(testSecret, 15, 7, 30)
	if _, err := svc.ValidateAccessToken(token); err == nil {
		t.Error("ValidateAccessToken accepted an expired token, want error")
	}
}

// RS256, not HS384 or HS512: those share the *jwt.SigningMethodHMAC type and would pass the check.
func TestValidateRejectsWrongAlgorithm(t *testing.T) {
	t.Parallel()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}

	claims := &secure.Claims{
		AdminID:   uuid.New(),
		TokenType: secure.TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodRS256, claims).SignedString(key)
	if err != nil {
		t.Fatalf("sign rs256 token: %v", err)
	}

	svc := secure.NewTokenService(testSecret, 15, 7, 30)
	if _, err := svc.ValidateAccessToken(token); err == nil {
		t.Error("ValidateAccessToken accepted a token signed with RS256, want error")
	}
}
