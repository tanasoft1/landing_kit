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

func TestAccessTokenRoundTrip(t *testing.T) {
	t.Parallel()

	svc := secure.NewTokenService(testSecret, 1, 7)
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

	svc := secure.NewTokenService(testSecret, 1, 7)
	adminID := uuid.New()

	token, err := svc.GenerateRefreshToken(adminID)
	if err != nil {
		t.Fatalf("GenerateRefreshToken: %v", err)
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
}

// An access token presented where a refresh token is required, and vice versa, must both be
// rejected. A token type checked only at issue time is not checked at all: accepting an access
// token as a refresh token (or the reverse) would silently swap in the wrong session lifetime.
func TestCrossTokenTypeIsRejectedBothWays(t *testing.T) {
	t.Parallel()

	svc := secure.NewTokenService(testSecret, 1, 7)
	adminID := uuid.New()

	access, err := svc.GenerateAccessToken(adminID, "admin@example.mn")
	if err != nil {
		t.Fatalf("GenerateAccessToken: %v", err)
	}
	refresh, err := svc.GenerateRefreshToken(adminID)
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

	issuer := secure.NewTokenService(testSecret, 1, 7)
	verifier := secure.NewTokenService("a-completely-different-secret-value", 1, 7)

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

	// Built directly with jwt, not through GenerateAccessToken: the service's expiry is
	// configured in whole hours, too coarse to produce an already-expired token in a fast test.
	// Same secret and shape parseToken expects, so this exercises exactly the expiry check.
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

	svc := secure.NewTokenService(testSecret, 1, 7)
	if _, err := svc.ValidateAccessToken(token); err == nil {
		t.Error("ValidateAccessToken accepted an expired token, want error")
	}
}

// jwt.Parse's keyfunc runs before signature verification, so a keyfunc that returns the secret
// unconditionally accepts anything the library can parse. RS256 proves the method assertion
// actually runs: it is a different concrete Go type from *jwt.SigningMethodHMAC, unlike HS384 or
// HS512, which would pass a same-Go-type check while still being the "wrong" algorithm this
// service issues.
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

	svc := secure.NewTokenService(testSecret, 1, 7)
	if _, err := svc.ValidateAccessToken(token); err == nil {
		t.Error("ValidateAccessToken accepted a token signed with RS256, want error")
	}
}
