package conf

import (
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
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
	// CORSOrigins is a comma-separated allowlist. The admin panel's origin must be listed too, or
	// the refresh cookie never travels. The default is the Vite dev origin, and Load refuses it
	// outside development, because a wrong origin drops every form submission at preflight with no
	// server log. Load refuses any "*" entry in every environment, since responses are credentialed.
	CORSOrigins string
	// ProxyHeader names the header to read the client IP from behind a load balancer.
	// Empty means use the socket address. Only set it if a proxy really writes that header.
	ProxyHeader string
	// TrustedProxies lists the IPs or CIDR ranges allowed to set ProxyHeader. Without it the
	// header is ignored, because otherwise any client could pick its own IP and dodge the login limiter.
	TrustedProxies string
}

// TrustedProxyList splits TrustedProxies into the form fiber.Config wants. Load has already
// checked each entry, because Fiber silently drops one it cannot parse.
func (s ServerConfig) TrustedProxyList() []string {
	return splitList(s.TrustedProxies)
}

func splitList(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

type DatabaseConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	DBName   string
	SSLMode  string
}

// NotifyConfig drives the lead notifier. Driver is "ses" or "log". Load refuses "log" in
// production, where leads would be stored and nobody told.
type NotifyConfig struct {
	Driver    string
	To        string
	From      string
	AWSRegion string
	AWSKeyID  string
	AWSSecret string
	// SiteName prefixes the subject line so one inbox can tell several sites apart. Optional.
	// It copies site.config.ts's name, because the API cannot read a TypeScript file.
	SiteName string
}

// JWTConfig drives secure.TokenService. Load rejects an empty or short Secret outside development.
type JWTConfig struct {
	Secret              string
	AccessExpireMinutes int
	RefreshExpireDays   int
	// SessionMaxDays is the absolute lifetime of one login's token family. RefreshExpireDays alone
	// is an idle timeout, so a stolen token that keeps rotating would never expire without this.
	SessionMaxDays int
}

// DSN builds one connection URL for both golang-migrate and pgxpool. net/url escapes every part,
// so a password with a space still works.
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

	accessExpireMinutes, err := strconv.Atoi(getEnv("JWT_ACCESS_EXPIRE_MINUTES", "15"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_ACCESS_EXPIRE_MINUTES: %w", err)
	}
	refreshExpireDays, err := strconv.Atoi(getEnv("JWT_REFRESH_EXPIRE_DAYS", "7"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_REFRESH_EXPIRE_DAYS: %w", err)
	}
	sessionMaxDays, err := strconv.Atoi(getEnv("JWT_SESSION_MAX_DAYS", "30"))
	if err != nil {
		return nil, fmt.Errorf("invalid JWT_SESSION_MAX_DAYS: %w", err)
	}

	cfg := &Config{
		Server: ServerConfig{
			Port:           getEnv("PORT", "3000"),
			AppEnv:         AppEnv(),
			CORSOrigins:    getEnv("CORS_ORIGINS", devCORSOrigins),
			ProxyHeader:    getEnv("PROXY_HEADER", ""),
			TrustedProxies: getEnv("TRUSTED_PROXIES", ""),
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
			// No default here: a public default secret would make every deploy's tokens forgeable.
			// Only development gets devJWTSecret, just below.
			Secret:              getEnv("JWT_SECRET", ""),
			AccessExpireMinutes: accessExpireMinutes,
			RefreshExpireDays:   refreshExpireDays,
			SessionMaxDays:      sessionMaxDays,
		},
	}

	if cfg.JWT.Secret == "" && cfg.Server.AppEnv == defaultAppEnv {
		cfg.JWT.Secret = devJWTSecret
	}

	// Any non-development env, not only "production": staging has a real origin too.
	if cfg.Server.AppEnv != defaultAppEnv && cfg.Server.CORSOrigins == devCORSOrigins {
		return nil, fmt.Errorf(
			"CORS_ORIGINS is still the development default (%s) with APP_ENV=%s: "+
				"every contact form submission would be dropped at preflight with no error",
			devCORSOrigins, cfg.Server.AppEnv)
	}

	// Refuse any "*" in every env, including subdomain patterns like "https://*.example.com".
	// Responses are credentialed, so any matching host could read a fresh access token from
	// /api/auth/refresh. A takeover of one forgotten subdomain would become full panel access.
	for _, origin := range strings.Split(cfg.Server.CORSOrigins, ",") {
		if !strings.Contains(origin, "*") {
			continue
		}
		if strings.TrimSpace(origin) == "*" {
			return nil, fmt.Errorf(
				"CORS_ORIGINS is %q, which allows every origin: the admin session cookie travels "+
					"on credentialed requests, and honouring one from any origin would hand a "+
					"logged-in admin session to every site a browser visits",
				cfg.Server.CORSOrigins)
		}
		return nil, fmt.Errorf(
			"CORS_ORIGINS entry %q is a wildcard: responses here are credentialed, so every host "+
				"matching that pattern could call /api/auth/refresh with the admin's cookie and "+
				"read the access token out of the reply. List each origin literally",
			strings.TrimSpace(origin))
	}

	// Fiber only warns and drops an entry it cannot parse, so a typo would quietly stop trusting the proxy.
	for _, proxy := range cfg.Server.TrustedProxyList() {
		if strings.Contains(proxy, "/") {
			if _, _, err := net.ParseCIDR(proxy); err != nil {
				return nil, fmt.Errorf("TRUSTED_PROXIES entry %q is not a valid CIDR range: %w", proxy, err)
			}
			continue
		}
		if net.ParseIP(proxy) == nil {
			return nil, fmt.Errorf("TRUSTED_PROXIES entry %q is not a valid IP address", proxy)
		}
	}

	if cfg.Notify.Driver != notifyDriverLog && cfg.Notify.Driver != notifyDriverSES {
		return nil, fmt.Errorf("invalid NOTIFY_DRIVER %q: want \"ses\" or \"log\"", cfg.Notify.Driver)
	}
	// Only "production", on purpose: staging should keep the log driver so it never emails a real client.
	if cfg.Server.AppEnv == "production" && cfg.Notify.Driver == notifyDriverLog {
		return nil, errors.New("NOTIFY_DRIVER=log in production: leads would be stored and never delivered")
	}
	// A notify failure never fails the request, so a missing value here would mean silent loss.
	// AWS_REGION is not required: an EC2 or EKS role can supply it. notify.NewSES checks it.
	if cfg.Notify.Driver == notifyDriverSES {
		if cfg.Notify.To == "" {
			return nil, errors.New("NOTIFY_DRIVER=ses requires NOTIFY_TO")
		}
		if cfg.Notify.From == "" {
			return nil, errors.New("NOTIFY_DRIVER=ses requires SES_FROM")
		}
	}

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

const devCORSOrigins = "http://localhost:5173"

const defaultAppEnv = "development"

// IsDevelopment reports whether this process runs in the one environment allowed weaker defaults.
func (c *Config) IsDevelopment() bool {
	return c.Server.AppEnv == defaultAppEnv
}

const (
	notifyDriverLog = "log"
	notifyDriverSES = "ses"
)

// defaultDBPort matches the host port in docker-compose.yml, not 5432. A 5432 default would
// quietly connect a fresh clone to whatever Postgres the developer already runs.
const defaultDBPort = "5433"

// devJWTSecret is used only in development when JWT_SECRET is unset, so `pnpm dev` needs no .env.
const devJWTSecret = "development-only-secret-do-not-use-in-prod"

// minJWTSecretLen is 32 bytes, the SHA-256 output size. A shorter HS256 secret can be brute-forced
// offline from one token.
const minJWTSecretLen = 32

var (
	envFileOnce sync.Once
	errEnvFile  error
)

// LoadEnvFile reads .env into the process environment, at most once. main calls it before setting
// up logging, because APP_ENV often lives only in .env. A missing file is fine, and real env vars win.
func LoadEnvFile() error {
	envFileOnce.Do(func() {
		if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
			errEnvFile = fmt.Errorf("error loading .env file: %w", err)
		}
	})
	return errEnvFile
}

// AppEnv reads APP_ENV with Load's default, after reading .env. main needs it before Load runs.
func AppEnv() string {
	// Load reports this error, so do not report it twice.
	_ = LoadEnvFile()
	return getEnv("APP_ENV", defaultAppEnv)
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
