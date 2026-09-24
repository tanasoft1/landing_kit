// Package testsupport gives every integration test its own migrated, empty Postgres database.
package testsupport

import (
	"fmt"
	"net/url"
	"strconv"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/tanasoft1/testkit/pgkit"

	"landing-api/internal/db/dbsetup"
	"landing-api/internal/db/migrations"
	"landing-api/internal/db/sqlc"
)

// perTestPoolMaxConns keeps many parallel tests from exhausting max_connections.
const perTestPoolMaxConns = 4

// postgres is resolved once per test binary.
var postgres = pgkit.New(pgkit.Config{ //nolint:gochecknoglobals // one server per test binary
	Migrator: pgkit.FSMigrator(migrations.FS, dbsetup.RunMigrations),
})

// DB is a pristine database plus the handles tests need against it.
type DB struct {
	DSN     string
	Pool    *pgxpool.Pool
	Queries *sqlc.Queries
}

// Fresh returns a migrated, isolated database. Safe under t.Parallel.
func Fresh(t *testing.T) *DB {
	t.Helper()

	dsn := postgres.Fresh(t)

	// Use the real pool constructor so tests exercise its settings.
	poolDSN, err := withPoolMaxConns(dsn, perTestPoolMaxConns)
	if err != nil {
		t.Fatalf("testsupport: bound pool size: %v", err)
	}

	pool, err := dbsetup.NewPool(poolDSN)
	if err != nil {
		t.Fatalf("testsupport: create pool: %v", err)
	}
	t.Cleanup(pool.Close)

	return &DB{DSN: dsn, Pool: pool, Queries: sqlc.New(pool)}
}

// withPoolMaxConns sets the pool_max_conns query parameter on dsn.
func withPoolMaxConns(dsn string, n int) (string, error) {
	u, err := url.Parse(dsn)
	if err != nil {
		return "", fmt.Errorf("parse dsn: %w", err)
	}

	q := u.Query()
	q.Set("pool_max_conns", strconv.Itoa(n))
	u.RawQuery = q.Encode()

	return u.String(), nil
}
