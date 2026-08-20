package conf

import (
	"fmt"
	"net"
	"net/url"
	"os"
	"sync"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
}

type ServerConfig struct {
	Port   string
	AppEnv string
	// CORSOrigins is a comma-separated allowlist. In endpoint mode the browser posts the contact
	// form cross-origin, so a wrong value fails at preflight and surfaces as the same generic
	// error a real code bug would. See "check CORS first" under Gotchas in apps/web/README.md.
	//
	// The default is the Vite dev origin, which is right for development and catastrophic in
	// production: a deploy that forgets this boots cleanly, answers /api/health with 200, and
	// silently drops every real submission at preflight with no server-side log line. Load()
	// therefore refuses to start in production while this is still the default.
	//
	// psyfint_v2_back defaults to "*" instead, which fails open. That is fine for an endpoint
	// behind JWT and wrong for a public one: "*" lets any site on the internet post leads here.
	CORSOrigins string
	// ProxyHeader names the header Fiber reads the client IP from behind a load balancer.
	// Empty means "use the socket address". Do not set it unless a proxy really sets that
	// header: Fiber's c.IP() returns "" when the named header is absent, and a limiter keyed
	// on that collapses every caller into one bucket.
	ProxyHeader string
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// DSN builds one connection URL, used by BOTH golang-migrate and pgxpool.
//
// psyfint_v2_back has two methods here: DSN() returning a URL for golang-migrate, which accepts
// only a URL, and ConnectionString() returning key=value for pgx. One is enough because this URL
// is built with net/url rather than fmt.Sprintf, so every component is escaped and pgx parses it
// as happily as migrate does. psyfint's key=value form interpolates the password unquoted, which
// breaks on a password containing a space; there is no reason to reproduce that.
//
// The name follows psyfint's URL-returning method, not its key=value one, so a developer moving
// between the two repos reads the same name for the same shape.
func (d DatabaseConfig) DSN() string {
	u := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(d.User, d.Password),
		Host:   net.JoinHostPort(d.Host, d.Port),
		Path:   "/" + d.DBName,
	}
	q := u.Query()
	q.Set("sslmode", d.SSLMode)
	u.RawQuery = q.Encode()
	return u.String()
}

func Load() (*Config, error) {
	if err := LoadEnvFile(); err != nil {
		return nil, err
	}

	cfg := &Config{
		Server: ServerConfig{
			Port:        getEnv("PORT", "3000"),
			AppEnv:      AppEnv(),
			CORSOrigins: getEnv("CORS_ORIGINS", devCORSOrigins),
			ProxyHeader: getEnv("PROXY_HEADER", ""),
		},
		Database: DatabaseConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres"),
			DBName:   getEnv("DB_NAME", "landing"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
	}

	// Validated here, at the config boundary, so service wiring can never see a value that
	// half-works. This is the same rule psyfint_v2_back applies to its JWT, webhook and face
	// config, and the same shape as the NOTIFY_DRIVER check added later in this plan.
	// Any environment that is not development, not just the literal "production". A staging or
	// UAT deploy has a real origin and the same silent-drop failure mode, and guarding only the
	// one spelling leaves every other spelling unprotected.
	if cfg.Server.AppEnv != defaultAppEnv && cfg.Server.CORSOrigins == devCORSOrigins {
		return nil, fmt.Errorf(
			"CORS_ORIGINS is still the development default (%s) with APP_ENV=%s: "+
				"every contact form submission would be dropped at preflight with no error",
			devCORSOrigins, cfg.Server.AppEnv)
	}

	return cfg, nil
}

// devCORSOrigins is both the development default and the sentinel Load() checks for. Naming it
// once means the check cannot drift from the default it is guarding.
const devCORSOrigins = "http://localhost:5173"

const defaultAppEnv = "development"

var (
	envFileOnce sync.Once
	errEnvFile  error
)

// LoadEnvFile reads .env into the process environment, at most once.
//
// Exported and called by cmd/main.go BEFORE logging is configured, because APP_ENV commonly lives
// only in .env (see .env.example) and a handler chosen before that file is read locks the
// development text format in for the WHOLE PROCESS, even when .env says production. Reading
// APP_ENV before the file that defines it is the bug this function exists to prevent.
//
// Load calls it too, so Load stays correct when called on its own, for example from a test. The
// sync.Once makes the second call free.
//
// Absence is not an error: under docker-compose or any orchestrator the variables are injected
// directly and there is no .env on disk. godotenv never overrides a variable already in the OS
// environment, so OS env always wins over the file.
func LoadEnvFile() error {
	envFileOnce.Do(func() {
		if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
			errEnvFile = fmt.Errorf("error loading .env file: %w", err)
		}
	})
	return errEnvFile
}

// AppEnv reads APP_ENV with the same default Load applies, after making sure .env has been read.
//
// Exported because cmd/main.go configures logging BEFORE calling Load: a Load failure is the most
// important line this service logs and has to come out in the environment's own format. Reading
// through this function rather than a second os.Getenv means the two readings cannot drift.
func AppEnv() string {
	// Error deliberately dropped: Load returns it, and the only thing it changes here is which
	// format a failing startup logs in. Reporting a malformed .env twice is worse than once.
	_ = LoadEnvFile()
	return getEnv("APP_ENV", defaultAppEnv)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
