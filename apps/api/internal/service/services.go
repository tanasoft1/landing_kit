// Package service wires the domain services from the pool, the notifier and config.
package service

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"landing-api/conf"
	"landing-api/internal/db/sqlc"
	"landing-api/internal/service/audit"
	"landing-api/internal/service/auth"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
	"landing-api/internal/utils/secure"
)

// Services holds every domain service plus the shared handles they were built from.
type Services struct {
	Lead    *lead.Service
	Auth    *auth.Service
	Audit   *audit.Service
	Queries *sqlc.Queries
	Pool    *pgxpool.Pool
	// TokenService is exposed for AuthMiddleware.
	TokenService *secure.TokenService
}

// New wires every service from the pool, the chosen notifier and config.
func New(pool *pgxpool.Pool, notifier notify.Notifier, cfg *conf.Config) *Services {
	q := sqlc.New(pool)
	tokenService := secure.NewTokenService(
		cfg.JWT.Secret, cfg.JWT.AccessExpireMinutes, cfg.JWT.RefreshExpireDays, cfg.JWT.SessionMaxDays)

	auditService := audit.New(q)

	return &Services{
		Lead:         lead.New(q, notifier),
		Auth:         auth.New(pool, q, tokenService, auditService),
		Audit:        auditService,
		Queries:      q,
		Pool:         pool,
		TokenService: tokenService,
	}
}
