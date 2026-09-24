package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"landing-api/conf"
	"landing-api/internal/db/dbsetup"
	"landing-api/internal/db/sqlc"
	"landing-api/internal/http/handlers"
	"landing-api/internal/http/routes"
	"landing-api/internal/service"
	"landing-api/internal/service/notify"
	"landing-api/internal/utils"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// main only maps run's error to an exit code. os.Exit skips defers, so the work lives in run.
func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", slog.Any("err", err))
		os.Exit(1)
	}
}

// setupLogging runs before conf.Load, so a config error is logged in the environment's format.
func setupLogging(appEnv string) {
	opts := &slog.HandlerOptions{
		AddSource: true,
		Level:     slog.LevelInfo,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				return slog.String(slog.TimeKey, a.Value.Time().Format("2006-01-02 15:04:05"))
			}
			return a
		},
	}

	var handler slog.Handler
	if appEnv == "production" {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	} else {
		handler = slog.NewTextHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(handler))
}

func run() error {
	// Read .env before choosing the log handler, because APP_ENV often lives only in .env.
	if err := conf.LoadEnvFile(); err != nil {
		return fmt.Errorf("load .env: %w", err)
	}
	setupLogging(conf.AppEnv())

	cfg, err := conf.Load()
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	if err := dbsetup.RunMigrations(cfg.Database.DSN()); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	pool, err := dbsetup.NewPool(cfg.Database.DSN())
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()

	// seed-admin reuses this config and pool, so it writes to the server's database. It returns
	// before any other log line, so its stdout is only the created email.
	if len(os.Args) > 1 && os.Args[1] == "seed-admin" {
		return runSeedAdmin(context.Background(), pool, os.Args[2:])
	}

	slog.Info("database connection established")

	// conf.Load has already rejected any driver other than "ses" and "log".
	var notifier notify.Notifier
	switch cfg.Notify.Driver {
	case "ses":
		notifier, err = notify.NewSES(context.Background(), cfg.Notify)
		if err != nil {
			return fmt.Errorf("build ses notifier: %w", err)
		}
	default:
		notifier = notify.NewLogger()
	}

	services := service.New(pool, notifier, cfg)
	h := handlers.New(services, cfg)

	// Warn, not refuse: ignoring the header is the safe direction, but it is probably a mistake.
	if cfg.Server.ProxyHeader != "" && len(cfg.Server.TrustedProxyList()) == 0 {
		slog.Warn("PROXY_HEADER is set but TRUSTED_PROXIES is empty, so the header is ignored and "+
			"every request is attributed to the address it arrived from: behind a proxy that is one "+
			"shared bucket for the rate limits and one shared key for the login backoff",
			slog.String("proxy_header", cfg.Server.ProxyHeader))
	}

	app := fiber.New(fiber.Config{
		AppName: "landing-api",
		// The largest request is a contact form capped at 4000 characters.
		BodyLimit:   1 * 1024 * 1024,
		ProxyHeader: cfg.Server.ProxyHeader,
		// Always on. With it off, Fiber trusts ProxyHeader from every caller, so anyone could
		// pick their own IP and dodge the login limiter. An empty list means trust nobody.
		EnableTrustedProxyCheck: true,
		TrustedProxies:          cfg.Server.TrustedProxyList(),
		// Keeps junk from a trusted proxy's header out of the audit log.
		EnableIPValidation: true,
	})

	routes.Setup(app, h, cfg.Server.CORSOrigins, services.TokenService, !cfg.IsDevelopment(),
		cfg.Server.ProxyHeader, cfg.Server.TrustedProxyList())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	addr := ":" + cfg.Server.Port
	slog.Info("server starting", slog.String("addr", addr), slog.String("env", cfg.Server.AppEnv))

	// Buffered so the goroutine never blocks if main has stopped waiting.
	listenErr := make(chan error, 1)
	go func() {
		if err := app.Listen(addr); err != nil {
			listenErr <- err
		}
	}()

	// Wait on both. Waiting on ctx alone hangs forever when the port is already bound.
	var failure error
	select {
	case <-ctx.Done():
		slog.Info("shutting down gracefully...")
		// select picks randomly between ready cases, so check for a bind failure that arrived too.
		select {
		case failure = <-listenErr:
		default:
		}
	case failure = <-listenErr:
	}

	// Safe after a bind failure too: it returns nil because Serve never ran.
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		// Logged, not returned: a non-zero exit would make a supervisor restart a deliberate stop.
		slog.Error("shutdown error", slog.Any("err", err))
	}

	if failure != nil {
		return fmt.Errorf("listen on %s: %w", addr, failure)
	}
	return nil
}

const minSeedAdminPasswordLen = 12

// runSeedAdmin hashes and inserts one admin_users row. It prints only the created email.
// The password comes from stdin, never argv, so it stays out of shell history and `ps`.
func runSeedAdmin(ctx context.Context, pool *pgxpool.Pool, args []string) error {
	if len(args) != 1 {
		return errors.New("usage: seed-admin <email>, with the password on stdin")
	}
	email := args[0]

	password, err := readSeedPassword(os.Stdin)
	if err != nil {
		return err
	}

	// Count runes, not bytes: one Cyrillic character is two bytes.
	if utf8.RuneCountInString(password) < minSeedAdminPasswordLen {
		return fmt.Errorf("password is %d characters, want at least %d",
			utf8.RuneCountInString(password), minSeedAdminPasswordLen)
	}

	hash, hashErr := utils.HashPassword(password)
	if hashErr != nil {
		return fmt.Errorf("hash password: %w", hashErr)
	}

	// The unique constraint on email makes a repeat seed fail.
	admin, err := sqlc.New(pool).CreateAdmin(ctx, sqlc.CreateAdminParams{
		ID:           uuid.New(),
		Email:        email,
		PasswordHash: hash,
	})
	if err != nil {
		return fmt.Errorf("create admin: %w", err)
	}

	fmt.Fprintln(os.Stdout, admin.Email) //nolint:errcheck // stdout write on a CLI's success path; nothing meaningful to do if it fails
	return nil
}

// readSeedPassword reads one line from r without its line ending. EOF with no newline is fine,
// because the makefile pipes the password with printf '%s'. The prompt goes to stderr, only on a terminal.
func readSeedPassword(r io.Reader) (string, error) {
	if f, ok := r.(*os.File); ok {
		if info, err := f.Stat(); err == nil && info.Mode()&os.ModeCharDevice != 0 {
			fmt.Fprint(os.Stderr, "Password: ") //nolint:errcheck // a prompt; the read below is what matters
		}
	}

	line, err := bufio.NewReader(r).ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("read password from stdin: %w", err)
	}

	password := strings.TrimRight(line, "\r\n")
	if password == "" {
		return "", errors.New("no password on stdin: pipe one in, or run `make seed-admin email=...`")
	}
	return password, nil
}
