// Package secure issues and validates the HS256 JWTs that carry admin identity.
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

// The token type is checked on every validation, so a long-lived refresh token never works as an
// access token.
var (
	errWrongTokenType          = errors.New("wrong token type")
	errUnexpectedSigningMethod = errors.New("unexpected signing method")
	errInvalidToken            = errors.New("invalid token")
)

// Claims carries the admin identity and the token type.
type Claims struct {
	jwt.RegisteredClaims

	AdminID   uuid.UUID `json:"admin_id"`
	Email     string    `json:"email,omitempty"`
	TokenType string    `json:"token_type"`
}

// TokenService signs and parses tokens with one shared HS256 secret.
type TokenService struct {
	secret              string
	accessExpireMinutes int
	refreshExpireDays   int
	sessionMaxDays      int
}

func NewTokenService(secret string, accessExpireMinutes, refreshExpireDays, sessionMaxDays int) *TokenService {
	return &TokenService{
		secret:              secret,
		accessExpireMinutes: accessExpireMinutes,
		refreshExpireDays:   refreshExpireDays,
		sessionMaxDays:      sessionMaxDays,
	}
}

// SessionDeadline is the absolute expiry a login stamps on the token family it starts.
func (s *TokenService) SessionDeadline(from time.Time) time.Time {
	return from.Add(time.Duration(s.sessionMaxDays) * 24 * time.Hour)
}

// GenerateAccessToken signs a short-lived token carrying the admin's identity.
func (s *TokenService) GenerateAccessToken(adminID uuid.UUID, email string) (string, error) {
	expiresAt := time.Now().Add(time.Duration(s.accessExpireMinutes) * time.Minute)

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

// GenerateRefreshToken signs a refresh token, capped at familyExpiresAt. It returns the expiry
// so the ledger row matches the token's exp claim.
func (s *TokenService) GenerateRefreshToken(adminID, jti uuid.UUID, familyExpiresAt time.Time) (string, time.Time, error) {
	expiresAt := time.Now().Add(time.Duration(s.refreshExpireDays) * 24 * time.Hour)
	if expiresAt.After(familyExpiresAt) {
		expiresAt = familyExpiresAt
	}

	signed, err := s.SignRefreshToken(adminID, jti, expiresAt)
	if err != nil {
		return "", time.Time{}, err
	}
	return signed, expiresAt, nil
}

// SignRefreshToken signs a refresh token for an existing jti and expiry. It re-sends the successor
// of a rotation whose response was lost.
func (s *TokenService) SignRefreshToken(adminID, jti uuid.UUID, expiresAt time.Time) (string, error) {
	claims := &Claims{
		AdminID:   adminID,
		TokenType: TokenTypeRefresh,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti.String(),
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

// ValidateAccessToken parses tokenString and rejects it unless its type is access.
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
		// Without this, jwt.Parse accepts a token signed with any algorithm the library supports.
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
