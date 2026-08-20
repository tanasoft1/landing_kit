// Package service wires the domain services this API exposes from their shared dependencies:
// the pgx pool, the notifier and config.
package service

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"landing-api/conf"
	"landing-api/internal/db/sqlc"
	"landing-api/internal/service/auth"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
	"landing-api/internal/utils/secure"
)

// Services holds every domain service plus the shared handles they were built from, so main
// registers one struct instead of threading each dependency through its own call site.
type Services struct {
	Lead    *lead.Service
	Auth    *auth.Service
	Queries *sqlc.Queries
	Pool    *pgxpool.Pool
	// TokenService is exposed separately from Auth because AuthMiddleware needs it too, on
	// every route behind it, not only on the login and refresh handlers Auth itself serves.
	TokenService *secure.TokenService
}

// New wires every service from the pool, the chosen notifier and config.
func New(pool *pgxpool.Pool, notifier notify.Notifier, cfg *conf.Config) *Services {
	q := sqlc.New(pool)
	tokenService := secure.NewTokenService(cfg.JWT.Secret, cfg.JWT.AccessExpireHours, cfg.JWT.RefreshExpireDays)

	return &Services{
		Lead:         lead.New(q, notifier),
		Auth:         auth.New(q, tokenService),
		Queries:      q,
		Pool:         pool,
		TokenService: tokenService,
	}
}
