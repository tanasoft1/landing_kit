// Package testsupport hands every integration test its own pristine, migrated Postgres
// database. Mirrors ~/work/psyfint_v2_back/internal/testsupport/db.go, minus its OrgID seeding,
// which is psyfint-specific: this service has no organizations table.
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

// perTestPoolMaxConns bounds how many connections dbsetup.NewPool opens for a single test's
// pool. Without it, pgxpool falls back to its own default (max(4, NumCPU)), and every DB test
// under Fresh holds its own pool at that ceiling; with universal parallelism, dozens of
// concurrently running tests each opening that many connections can exhaust the server's
// max_connections. A handful of connections is far more than any one test needs.
const perTestPoolMaxConns = 4

// postgres is resolved once per test-binary process. Migrations run once per distinct schema
// hash across the whole suite, not once per package.
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

	// The project's own pool constructor is used deliberately, so its settings are exercised by
	// every integration test rather than only in production. Its connection ceiling is bounded
	// for this test's pool specifically (see perTestPoolMaxConns); the DSN handed to
	// dbsetup.NewPool carries pool_max_conns, but DB.DSN above stays unbounded for callers that
	// open their own raw connections.
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

// withPoolMaxConns adds (or overwrites) the pool_max_conns query parameter on dsn.
// pgxpool.ParseConfig honours that key to cap MaxConns. Going through net/url instead of string
// concatenation means this composes correctly whether or not dsn already carries a query string
// (it does: postgres.Fresh returns one with sslmode=disable).
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
