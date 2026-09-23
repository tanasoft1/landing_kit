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

// main does nothing but map run's error to an exit code.
//
// The work lives in run so that `defer` still executes on the failure path: os.Exit skips
// deferred calls, so a `log.Fatalf` or a bare os.Exit inside the body would leak everything run
// registers a defer for, starting with the pgx pool.
func main() {
	if err := run(); err != nil {
		slog.Error("startup failed", slog.Any("err", err))
		os.Exit(1)
	}
}

// setupLogging installs the default slog handler for an environment.
//
// Split out and called BEFORE conf.Load so that a config failure, which is the single most
// important line this service ever logs, is emitted in the format the rest of the service
// promises. Configured after Load, that one line goes through slog's built-in default handler
// instead: stderr, stdlib text format, no source, even when APP_ENV=production promises JSON on
// stdout. That is exactly the line a JSON-only log pipeline drops.
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
	// .env is read before the log handler is chosen, not after. APP_ENV commonly lives only in
	// .env, and conf.Load is what used to read that file, so configuring logging from a value
	// read before Load locked the development text format in for the entire process whenever
	// APP_ENV came from the file rather than the shell.
	//
	// A malformed .env is still reported through slog's built-in default handler, because the
	// file that says which format to use is the file that failed to parse. That is unavoidable
	// and much rarer than a misread APP_ENV.
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
	// This defer is the reason main is split into main plus run. os.Exit skips deferred calls,
	// so returning an error is what lets the pool close on every failure path below.
	defer pool.Close()

	// Dispatched before the notifier or the HTTP server are built, following habido-back's
	// `./cmd cron` pattern of branching on os.Args[1] in the same entrypoint rather than
	// shipping a second binary. seed-admin needs nothing past this point: it reuses conf.Load
	// and this pool so it can never disagree with the server about which database it writes to,
	// then returns before a port is ever bound or the "database connection established" line
	// below is logged -- so its stdout carries exactly one line, the created email.
	if len(os.Args) > 1 && os.Args[1] == "seed-admin" {
		return runSeedAdmin(context.Background(), pool, os.Args[2:])
	}

	slog.Info("database connection established")

	// conf.Load already refuses NOTIFY_DRIVER values other than "ses" and "log" (and refuses
	// "log" in production), so the only two cases reachable here are the two switch handles.
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

	app := fiber.New(fiber.Config{
		AppName: "landing-api",
		// BodyLimit is 1 MB, well under the framework default: the largest request this service accepts is
		// a contact form whose message field is capped at 4000 characters. A high limit on a
		// public unauthenticated endpoint is free memory pressure for an attacker.
		BodyLimit:   1 * 1024 * 1024,
		ProxyHeader: cfg.Server.ProxyHeader,
		// ProxyHeader alone is not a setting, it is a hole. Fiber consults it only when
		// EnableTrustedProxyCheck is on, and that flag defaults to false, which makes
		// IsProxyTrusted() answer true for every caller: c.IP() then returns whatever the request
		// wrote in that header. Any deployment that set PROXY_HEADER handed each caller a fresh
		// rate-limit bucket per request -- bypassing the limiter in front of the login endpoint
		// outright -- and let them write their own text into admin_audit_log.ip.
		//
		// Turned on unconditionally, including when TrustedProxies is empty. That combination is
		// Fiber's "trust nobody": the header is ignored and every request keys on its socket peer.
		// Losing per-caller keying behind an unconfigured proxy is a cost, and it is the smaller
		// one, because the alternative is a limiter that anyone can step around by editing a
		// header. conf.Load parses the list so a typo fails at startup rather than degrading to
		// this quietly.
		EnableTrustedProxyCheck: true,
		TrustedProxies:          cfg.Server.TrustedProxyList(),
		// Without this c.IP() returns the header's raw first field, whatever it contains. With it
		// the value is parsed as an IP and only a valid one comes back, so a trusted proxy that
		// forwards junk cannot put junk in the audit log.
		EnableIPValidation: true,
	})

	routes.Setup(app, h, cfg.Server.CORSOrigins, services.TokenService, !cfg.IsDevelopment())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	addr := ":" + cfg.Server.Port
	slog.Info("server starting", slog.String("addr", addr), slog.String("env", cfg.Server.AppEnv))

	// Buffered size 1 with a single writer, so the goroutine can never block on send even if
	// main has already stopped waiting.
	listenErr := make(chan error, 1)
	go func() {
		if err := app.Listen(addr); err != nil {
			listenErr <- err
		}
	}()

	// Waits on BOTH, rather than waiting on ctx and then polling listenErr with a default case.
	// The polling version had a real race: ctx has two cancellers, this goroutine and the OS
	// signal handler, so an external SIGTERM arriving alongside a bind failure could wake main
	// before the send landed, and the default branch then returned nil. A process that never
	// served a request would report success. Measured at roughly one in four under contention in
	// an isolated reproduction of that shape.
	//
	// Blocking on both removes the race instead of narrowing it, and the goroutine no longer
	// needs to cancel ctx at all. Waiting on ctx alone would hang forever when the port is
	// already bound.
	var failure error
	select {
	case <-ctx.Done():
		slog.Info("shutting down gracefully...")
		// A bind failure and a signal can become ready in the same instant, and Go's select
		// tie-break between two ready cases is pseudo-random. Measured at close to an even
		// split, so without this check a coin flip decided whether a process that never served
		// a request reported the failure it actually had. Checked, not left to chance.
		select {
		case failure = <-listenErr:
		default:
		}
	case failure = <-listenErr:
		// Nothing to cancel: main simply stops waiting.
	}

	// Runs on both paths. On a bind failure it returns nil immediately, because fasthttp checks
	// `s.ln == nil` and Serve never ran.
	if err := app.ShutdownWithTimeout(10 * time.Second); err != nil {
		// Logged, not returned. A shutdown that timed out after an operator asked for one is
		// still an intentional stop, and exiting non-zero would report failure for a requested
		// action and make a supervisor restart what someone deliberately stopped.
		slog.Error("shutdown error", slog.Any("err", err))
	}

	if failure != nil {
		return fmt.Errorf("listen on %s: %w", addr, failure)
	}
	return nil
}

// minSeedAdminPasswordLen is the floor `./cmd seed-admin` enforces on the password it is given.
// A different concern from conf.minJWTSecretLen: this is a human-chosen login password, not a
// generated HMAC key, so the floor is a password-strength minimum rather than a
// brute-force-resistance one.
const minSeedAdminPasswordLen = 12

// runSeedAdmin hashes and inserts one admin_users row. It reuses the pool run built from
// conf.Load, rather than opening its own connection from separately parsed flags, specifically so
// this can never point at a different database than the server this admin will log into.
//
// Prints nothing but the created email: not the password, not its hash, not the row's id. A
// seeded password must never reach a terminal scrollback or a CI log, so nothing else is written
// anywhere on the success path.
//
// And it never reaches the command line either. The password used to be args[1], which put the
// only credential guarding the panel into the shell's history file, the terminal scrollback, and
// the process table, where any local user's `ps` could read it for as long as `go run` took to
// compile and run. Careful output on the success path bought nothing while the documented way to
// invoke the command leaked the value before it started. Reading stdin means a pipe or a heredoc
// carries it and nothing persists it.
func runSeedAdmin(ctx context.Context, pool *pgxpool.Pool, args []string) error {
	if len(args) != 1 {
		return errors.New("usage: seed-admin <email>, with the password on stdin")
	}
	email := args[0]

	password, err := readSeedPassword(os.Stdin)
	if err != nil {
		return err
	}

	// Runes, not bytes. len() counts bytes, and this kit defaults to Mongolian: six Cyrillic
	// characters are twelve bytes, so a six-character password passed a twelve-character floor.
	if utf8.RuneCountInString(password) < minSeedAdminPasswordLen {
		return fmt.Errorf("password is %d characters, want at least %d",
			utf8.RuneCountInString(password), minSeedAdminPasswordLen)
	}

	hash, hashErr := utils.HashPassword(password)
	if hashErr != nil {
		return fmt.Errorf("hash password: %w", hashErr)
	}

	// The unique constraint on admin_users.email, not a pre-check here, is what stops a second
	// seed of the same email from silently creating a duplicate: CreateAdmin returns this
	// service's error unchanged, so a repeat seed fails loudly instead of succeeding twice.
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

// readSeedPassword takes one line off r and returns it with its line ending removed.
//
// One line, not everything r has: a password containing a newline is not a password an operator
// can type back into the login form, and reading to EOF would quietly accept a whole file as one.
// io.EOF without a line ending is success, because `printf '%s' "$pw" | ...` -- what the makefile
// pipes -- sends no trailing newline.
//
// The prompt goes to stderr only when stdin is a terminal, so a piped invocation's output stays
// exactly what it was: nothing but the created email on stdout. The characters still echo when
// someone types here directly; `make seed-admin` turns echo off around the read, which is why that
// is the documented way in.
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
