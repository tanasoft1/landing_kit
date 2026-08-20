// Package auth implements admin login and token refresh. Mirrors
// ~/work/psyfint_v2_back/internal/service/auth/auth.go, with one deliberate difference: Login
// always runs bcrypt, even when the email does not exist (see the comment on dummyPasswordHash
// below), where psyfint returns on pgx.ErrNoRows before ever calling bcrypt.
package auth

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"

	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/models"
	"landing-api/internal/utils"
	"landing-api/internal/utils/secure"
)

// errInvalidCredentials is returned for BOTH an unknown email and a wrong password, and for
// nothing else. One error for both failure modes is what keeps the endpoint from being an
// account-existence oracle: a caller who can tell "no such admin" apart from "wrong password"
// can enumerate every registered email with one request per guess.
var errInvalidCredentials = errors.New("invalid credentials")

// errInvalidToken is returned when a refresh token fails validation, or validates but names an
// admin that no longer exists. Both collapse to the same error and the same 401: an attacker
// who can tell "token malformed" from "admin was deleted" learns something the token itself did
// not entitle them to know.
var errInvalidToken = errors.New("invalid token")

// dummyPasswordHash is a bcrypt hash of a fixed string nobody's real password is checked
// against. It exists so Login can run bcrypt.CompareHashAndPassword on every attempt, including
// one against an email that is not registered.
//
// psyfint_v2_back returns on pgx.ErrNoRows before comparing anything, which is faster for that
// one path -- and that speed difference is exactly what makes it an oracle: bcrypt is
// deliberately slow (that is its entire purpose), so a request that skips it returns measurably
// sooner than one that runs it. An attacker timing responses can use that gap to enumerate valid
// emails without ever seeing a different error message. Comparing against this fixed hash costs
// one bcrypt call on every path and closes the gap the identical error message alone does not.
const dummyPasswordHash = "$2a$10$uJZNA0fM7Ye.pwsk8uffEO6kmwmv9iOQz/PRe9TlQUAZzBErcmiZG" //nolint:gosec // a bcrypt hash of a fixed non-secret string, not a credential

type Service struct {
	queries      *sqlc.Queries
	tokenService *secure.TokenService
}

func New(queries *sqlc.Queries, tokenService *secure.TokenService) *Service {
	return &Service{queries: queries, tokenService: tokenService}
}

// Login checks req's credentials and, on success, issues a fresh access/refresh token pair.
func (s *Service) Login(ctx context.Context, req *models.RqLogin) (*models.RsAuth, error) {
	admin, err := s.queries.GetAdminByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// See dummyPasswordHash above: run bcrypt here too, even though the result is
			// discarded, so this branch takes the same time as a registered email with the
			// wrong password.
			utils.CheckPasswordHash(req.Password, dummyPasswordHash)
			slog.Warn("login attempt with unknown email")
			return nil, errInvalidCredentials
		}
		slog.Error("failed to query admin during login", slog.Any("err", err))
		return nil, fmt.Errorf("get admin by email: %w", err)
	}

	if !utils.CheckPasswordHash(req.Password, admin.PasswordHash) {
		slog.Warn("login attempt with invalid password", slog.String("admin_id", admin.ID.String()))
		return nil, errInvalidCredentials
	}

	slog.Info("admin login succeeded", slog.String("admin_id", admin.ID.String()))
	return s.issueTokenPair(admin)
}

// Refresh validates req's refresh token and, on success, issues a fresh pair. The admin row is
// re-read rather than trusted from the token's claims, so an admin removed after the refresh
// token was issued cannot use it to obtain a new access token.
func (s *Service) Refresh(ctx context.Context, req *models.RqRefreshToken) (*models.RsAuth, error) {
	claims, err := s.tokenService.ValidateRefreshToken(req.RefreshToken)
	if err != nil {
		slog.Warn("refresh token validation failed", slog.Any("err", err))
		return nil, errInvalidToken
	}

	admin, err := s.queries.GetAdminByID(ctx, claims.AdminID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			slog.Warn("refresh token names an admin that no longer exists",
				slog.String("admin_id", claims.AdminID.String()))
			return nil, errInvalidToken
		}
		slog.Error("failed to query admin during refresh", slog.Any("err", err))
		return nil, fmt.Errorf("get admin by id: %w", err)
	}

	slog.Info("token refresh succeeded", slog.String("admin_id", admin.ID.String()))
	return s.issueTokenPair(admin)
}

func (s *Service) issueTokenPair(admin sqlc.AdminUser) (*models.RsAuth, error) {
	accessToken, err := s.tokenService.GenerateAccessToken(admin.ID, admin.Email)
	if err != nil {
		return nil, fmt.Errorf("generate access token: %w", err)
	}
	refreshToken, err := s.tokenService.GenerateRefreshToken(admin.ID)
	if err != nil {
		return nil, fmt.Errorf("generate refresh token: %w", err)
	}

	return &models.RsAuth{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		Admin: models.RsAdminProfile{
			ID:        admin.ID,
			Email:     admin.Email,
			CreatedAt: admin.CreatedAt.Format(time.RFC3339),
		},
	}, nil
}

// IsInvalidCredentials reports whether err is the credentials failure Login returns, so the
// handler can map it to its own status and message without importing an unexported sentinel.
func IsInvalidCredentials(err error) bool {
	return errors.Is(err, errInvalidCredentials)
}

// IsInvalidToken reports whether err is the token failure Refresh returns.
func IsInvalidToken(err error) bool {
	return errors.Is(err, errInvalidToken)
}
