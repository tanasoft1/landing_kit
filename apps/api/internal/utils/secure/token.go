// Package secure issues and validates the HS256 JWTs that carry admin identity between the login
// endpoint and every route behind AuthMiddleware. Mirrors
// ~/work/psyfint_v2_back/internal/utils/secure/token.go: same shape, same two checks that keep a
// stolen or mistyped token from doing more than the caller intended.
package secure

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

// errWrongTokenType and errUnexpectedSigningMethod are the two checks a token-issued-at-time
// check cannot replace: TokenType is read back out of the claims on every validation, and the
// signing method is asserted in the keyfunc, not merely assumed from how this service signs.
//
// A refresh token has a much longer life than an access token (days versus an hour, see
// conf.JWTConfig), so accepting one as the other silently extends the session window to the
// longer one. And jwt.Parse's keyfunc runs before signature verification: a keyfunc that returns
// the secret unconditionally accepts anything the library can parse, including a token signed
// with "none" in some configurations, which is why the method is asserted here rather than left
// to the library's default.
var (
	errWrongTokenType          = errors.New("wrong token type")
	errUnexpectedSigningMethod = errors.New("unexpected signing method")
	errInvalidToken            = errors.New("invalid token")
)

// Claims carries the admin identity through the token, plus its own type so a caller can tell an
// access token from a refresh token after parsing (see the type check in parseToken's two
// callers below).
type Claims struct {
	jwt.RegisteredClaims

	AdminID   uuid.UUID `json:"admin_id"`
	Email     string    `json:"email,omitempty"`
	TokenType string    `json:"token_type"`
}

// TokenService signs and parses tokens with one shared secret. HS256, not RSA: this service's
// only client is its own admin UI, so one secret to manage beats a keypair (see the plan's
// "Decisions taken before writing this").
type TokenService struct {
	secret            string
	accessExpireHours int
	refreshExpireDays int
}

func NewTokenService(secret string, accessExpireHours, refreshExpireDays int) *TokenService {
	return &TokenService{
		secret:            secret,
		accessExpireHours: accessExpireHours,
		refreshExpireDays: refreshExpireDays,
	}
}

// GenerateAccessToken signs a short-lived token carrying the admin's identity, used to
// authorize requests to routes behind AuthMiddleware.
func (s *TokenService) GenerateAccessToken(adminID uuid.UUID, email string) (string, error) {
	expiresAt := time.Now().Add(time.Duration(s.accessExpireHours) * time.Hour)

	claims := &Claims{
		AdminID:   adminID,
		Email:     email,
		TokenType: TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(s.secret))
	if err != nil {
		return "", fmt.Errorf("sign access token: %w", err)
	}
	return signed, nil
}

// GenerateRefreshToken signs a long-lived token used only to obtain a new token pair through
// Refresh. It deliberately carries no email: a refresh token's one job is proving the admin id,
// and the endpoint that consumes it (internal/service/auth.Refresh) looks the admin up again
// before issuing anything, rather than trusting a value that may be days stale.
func (s *TokenService) GenerateRefreshToken(adminID uuid.UUID) (string, error) {
	expiresAt := time.Now().Add(time.Duration(s.refreshExpireDays) * 24 * time.Hour)

	claims := &Claims{
		AdminID:   adminID,
		TokenType: TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(s.secret))
	if err != nil {
		return "", fmt.Errorf("sign refresh token: %w", err)
	}
	return signed, nil
}

// ValidateAccessToken parses tokenString and rejects it unless its type is access. See the
// package doc for why that check runs on every validation rather than only at issue time.
func (s *TokenService) ValidateAccessToken(tokenString string) (*Claims, error) {
	claims, err := s.parseToken(tokenString)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != TokenTypeAccess {
		return nil, fmt.Errorf("%w: want %s, got %s", errWrongTokenType, TokenTypeAccess, claims.TokenType)
	}
	return claims, nil
}

// ValidateRefreshToken parses tokenString and rejects it unless its type is refresh.
func (s *TokenService) ValidateRefreshToken(tokenString string) (*Claims, error) {
	claims, err := s.parseToken(tokenString)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != TokenTypeRefresh {
		return nil, fmt.Errorf("%w: want %s, got %s", errWrongTokenType, TokenTypeRefresh, claims.TokenType)
	}
	return claims, nil
}

func (s *TokenService) parseToken(tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (any, error) {
		// Asserted, not assumed: without this, a keyfunc that returns the secret unconditionally
		// lets jwt.Parse accept a token signed with any algorithm the library supports.
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("%w: %v", errUnexpectedSigningMethod, token.Header["alg"])
		}
		return []byte(s.secret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}
	if !token.Valid {
		return nil, errInvalidToken
	}

	return claims, nil
}
