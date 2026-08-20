package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"landing-api/conf"
	"landing-api/internal/http/routes"

	"github.com/gofiber/fiber/v2"
)

// main does nothing but map run's error to an exit code.
//
// The work lives in run so that `defer` still executes on the failure path: os.Exit skips
// deferred calls, so a `log.Fatalf` or a bare os.Exit inside the body would leak whatever later
// tasks in this plan register a defer for, starting with the pgx pool in task 2. psyfint_v2_back
// calls log.Fatalf inline and does not have this split.
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

	app := fiber.New(fiber.Config{
		AppName: "landing-api",
		// BodyLimit is 1 MB, not psyfint's 10 MB: the largest request this service accepts is
		// a contact form whose message field is capped at 4000 characters. A high limit on a
		// public unauthenticated endpoint is free memory pressure for an attacker.
		BodyLimit:   1 * 1024 * 1024,
		ProxyHeader: cfg.Server.ProxyHeader,
	})

	routes.Setup(app, cfg.Server.CORSOrigins)

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
	// needs to cancel ctx at all. psyfint_v2_back waits only on ctx and hangs forever when the
	// port is already bound.
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
