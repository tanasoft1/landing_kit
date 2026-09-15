package dbsetup

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool pings before returning so a bad DSN fails at startup rather than on the first request.
func NewPool(dsn string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	// Cap how long a statement will wait on a lock. Without this a request that blocks on a
	// contended row or an advisory lock waits forever, holding a pooled connection the whole
	// time, because the HTTP layer hands the database a context with no deadline. Failing a
	// slow request loudly is better than losing a connection to it silently. The value is far
	// above any lock this API holds on purpose, so reaching it means something is wrong.
	if config.ConnConfig.RuntimeParams == nil {
		config.ConnConfig.RuntimeParams = map[string]string{}
	}
	config.ConnConfig.RuntimeParams["lock_timeout"] = "3000"

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("failed to create connection pool: %w", err)
	}

	if err := pool.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return pool, nil
}
