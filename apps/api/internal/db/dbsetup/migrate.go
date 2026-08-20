package dbsetup

import (
	"errors"
	"fmt"
	"log/slog"

	"landing-api/internal/db/migrations"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
)

func RunMigrations(dsn string) error {
	sourceDriver, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("failed to create migration source: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", sourceDriver, dsn)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}
	// Close releases the source driver and the database connection golang-migrate opened
	// for dsn. Without it, that connection stays open for the life of the process: on a
	// long-lived boot this is a single leaked idle connection, but pgtestdb requires zero
	// open connections against a database before it can clone it as a template, so the
	// leak surfaces as a deterministic "source database is being accessed by other users"
	// failure the first time a test template is built.
	defer func() {
		if srcErr, dbErr := m.Close(); srcErr != nil || dbErr != nil {
			slog.Warn("failed to close migrate instance",
				slog.Any("source_err", srcErr), slog.Any("db_err", dbErr))
		}
	}()

	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}
