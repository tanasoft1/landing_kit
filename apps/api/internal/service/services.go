// Package service wires the domain services this API exposes from their shared dependencies:
// the pgx pool, the notifier and config.
package service

import (
	"github.com/jackc/pgx/v5/pgxpool"

	"landing-api/conf"
	"landing-api/internal/db/sqlc"
	"landing-api/internal/service/lead"
	"landing-api/internal/service/notify"
)

// Services holds every domain service plus the shared handles they were built from, so main
// registers one struct instead of threading each dependency through its own call site.
type Services struct {
	Lead    *lead.Service
	Queries *sqlc.Queries
	Pool    *pgxpool.Pool
}

// New wires every service from the pool, the chosen notifier and config.
//
// cfg is currently unused: task 5 wires only lead.Service, which needs nothing from it beyond
// what the caller already resolved into notifier. It stays in this signature because task 6's
// admin endpoint is the reason New takes it at all, and changing a constructor's signature once
// every caller already depends on it is a larger diff than carrying an unused parameter for one
// task.
func New(pool *pgxpool.Pool, notifier notify.Notifier, cfg *conf.Config) *Services {
	q := sqlc.New(pool)

	return &Services{
		Lead:    lead.New(q, notifier),
		Queries: q,
		Pool:    pool,
	}
}
