package conf

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"sync"

	"github.com/joho/godotenv"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Notify   NotifyConfig
	JWT      JWTConfig
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

// NotifyConfig drives internal/service/notify. Driver is "ses" or "log".
//
// It defaults to "log" so `pnpm dev` runs with no AWS account and no credentials. That default is
// also the trap: a production deploy that forgets NOTIFY_DRIVER stores every lead correctly and
// tells nobody, with no error anywhere. Load therefore refuses to start when AppEnv is
// "production" and the driver is still "log".
type NotifyConfig struct {
	Driver    string
	To        string
	From      string
	AWSRegion string
	AWSKeyID  string
	AWSSecret string
	// SiteName prefixes the subject line, so an owner whose inbox receives leads from several
	// sites this template built can tell them apart. Optional: empty means the subject carries
	// just the visitor's name. Deliberately NOT the source path, which belongs in the body;
	// "New lead from /contact" names a route rather than a site.
	//
	// Duplicated from site.config.ts's `name` rather than shared, because the API is a separate
	// process from the web build and has no way to read a TypeScript file.
	SiteName string
}

// JWTConfig drives internal/utils/secure.TokenService. Secret is validated below, at the config
// boundary: HS256 with a short secret is brute-forceable offline once an attacker holds one
// token to check guesses against, and an empty secret makes every token forgeable by anyone who
// can compute an HMAC. Load refuses to start on either problem outside development, the same
// asymmetry the CORS_ORIGINS check above documents: a staging deploy has real admins and the
// same forgeable-token failure mode a production deploy has.
type JWTConfig struct {
	Secret            string
	AccessExpireHours int
	RefreshExpireDays int
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

	// Parsed here, not left as strings for a caller to convert: a bad value fails Load itself
	// rather than reaching secure.NewTokenService, which has no way to report it beyond a panic
	// or a silently wrong duration.
	accessExpireHours, err := strconv.Atoi(getEnv("JWT_ACCESS_EXPIRE_HOURS", "1"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRE_HOURS: %w", err)
	}
	refreshExpireDays, err := strconv.Atoi(getEnv("JWT_REFRESH_EXPIRE_DAYS", "7"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRE_DAYS: %w", err)
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
			Port:     getEnv("DB_PORT", defaultDBPort),
			User:     getEnv("DB_USER", "postgres"),
			Password: getEnv("DB_PASSWORD", "postgres"),
			DBName:   getEnv("DB_NAME", "landing"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		Notify: NotifyConfig{
			Driver:    getEnv("NOTIFY_DRIVER", notifyDriverLog),
			To:        getEnv("NOTIFY_TO", ""),
			From:      getEnv("SES_FROM", ""),
			AWSRegion: getEnv("AWS_REGION", ""),
			AWSKeyID:  getEnv("AWS_ACCESS_KEY_ID", ""),
			AWSSecret: getEnv("AWS_SECRET_ACCESS_KEY", ""),
			SiteName:  getEnv("NOTIFY_SITE_NAME", ""),
		},
		JWT: JWTConfig{
			// No blanket default, deliberately unlike CORS_ORIGINS above: that default is safe
			// to apply in every environment because the check right below catches it still
			// being in effect outside development. A default JWT secret cannot work that way,
			// because a shared, publicly-readable-in-this-repo string would make every deployed
			// instance's tokens forgeable by anyone who cloned the repo. So the default is
			// applied only when AppEnv is development (right after this literal), and every
			// other environment must set JWT_SECRET or fail the validation below.
			Secret:            getEnv("JWT_SECRET", ""),
			AccessExpireHours: accessExpireHours,
			RefreshExpireDays: refreshExpireDays,
		},
	}

	if cfg.JWT.Secret == "" && cfg.Server.AppEnv == defaultAppEnv {
		cfg.JWT.Secret = devJWTSecret
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

	if cfg.Notify.Driver != notifyDriverLog && cfg.Notify.Driver != notifyDriverSES {
		return nil, fmt.Errorf("invalid NOTIFY_DRIVER %q: want \"ses\" or \"log\"", cfg.Notify.Driver)
	}
	// Only "production", unlike the CORS check above which fires for anything that is not
	// "development". The asymmetry is deliberate: a staging deploy SHOULD keep the log driver,
	// because a staging site emailing a real client is worse than a staging site not emailing.
	// A staging deploy with the wrong CORS origin, by contrast, is simply broken.
	if cfg.Server.AppEnv == "production" && cfg.Notify.Driver == notifyDriverLog {
		return nil, errors.New("NOTIFY_DRIVER=log in production: leads would be stored and never delivered")
	}
	// Both required at this boundary, not just checked lazily inside NewSES: Notifier.Lead's
	// error is deliberately never allowed to fail the request it notifies about (see
	// notify.Notifier), so a deploy missing either of these boots cleanly, reports Driver=ses,
	// stores every lead, and notifies nobody from the first lead onward, discoverable only by
	// reading logs. Same trap as NOTIFY_DRIVER=log in production, through a different door.
	//
	// AWS_REGION is deliberately NOT required here alongside them: it has a legitimate ambient
	// source (an EC2 or EKS role's resolved region) that NOTIFY_TO and SES_FROM do not, so
	// requiring the variable would break that case. See the resolved-Region check in
	// notify.NewSES instead.
	if cfg.Notify.Driver == notifyDriverSES {
		if cfg.Notify.To == "" {
			return nil, errors.New("NOTIFY_DRIVER=ses requires NOTIFY_TO")
		}
		if cfg.Notify.From == "" {
			return nil, errors.New("NOTIFY_DRIVER=ses requires SES_FROM")
		}
	}

	// Same asymmetry as the CORS_ORIGINS check above and for the same reason: anything that is
	// not development gets a real admin login, so anything that is not development gets this
	// guard. devJWTSecret is long enough to pass the length check itself, but the check still
	// runs on it here rather than being skipped by construction, so a copy-pasted "just set
	// APP_ENV=development in prod to make the error go away" cannot silently work either.
	if cfg.Server.AppEnv != defaultAppEnv {
		if cfg.JWT.Secret == "" {
			return nil, errors.New("JWT_SECRET is required outside development: " +
				"an empty secret makes every admin token forgeable by anyone")
		}
		if len(cfg.JWT.Secret) < minJWTSecretLen {
			return nil, fmt.Errorf(
				"JWT_SECRET is %d characters, want at least %d: "+
					"HS256 with a short secret is brute-forceable offline once an attacker holds one token",
				len(cfg.JWT.Secret), minJWTSecretLen)
		}
	}

	return cfg, nil
}

// devCORSOrigins is both the development default and the sentinel Load() checks for. Naming it
// once means the check cannot drift from the default it is guarding.
const devCORSOrigins = "http://localhost:5173"

const defaultAppEnv = "development"

// notifyDriverLog and notifyDriverSES are the only two valid NOTIFY_DRIVER values. Named once so
// the default, the "invalid driver" check and the production guard cannot drift from each other.
const (
	notifyDriverLog = "log"
	notifyDriverSES = "ses"
)

// defaultDBPort matches the HOST port in docker-compose.yml, deliberately not Postgres's usual
// 5432. See the comment there for why compose avoids 5432.
//
// Kept in step with compose on purpose. A default of 5432 makes a fresh clone with no .env
// connect to whatever Postgres the developer already runs, which is a silently wrong database.
// A default of 5433 with no compose service running is a connection refused, which says what is
// wrong. Prefer the loud failure.
const defaultDBPort = "5433"

// devJWTSecret is the JWT_SECRET applied only when AppEnv is development and nothing else set
// one, so `pnpm dev` runs with no .env at all. It is long enough to pass minJWTSecretLen itself,
// but that is incidental, not load-bearing: the validation below never runs against it, because
// it only runs outside development.
const devJWTSecret = "development-only-secret-do-not-use-in-prod"

// minJWTSecretLen is the floor Load enforces on JWT_SECRET outside development. HS256 with a
// secret shorter than this is brute-forceable offline once an attacker holds one token to check
// guesses against; 32 bytes matches the guidance for HMAC-SHA256 keys (RFC 2104's "at least as
// long as the hash output", 32 bytes for SHA-256).
const minJWTSecretLen = 32

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
