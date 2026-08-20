package conf_test

import (
	"strings"
	"testing"

	"landing-api/conf"
)

// Config loading reads process env, so these cases cannot use t.Parallel: t.Setenv panics in a
// parallel test. Same documented exception as psyfint_v2_back's conf/config_test.go. A scratch
// .env is deliberately not used either: conf.LoadEnvFile is sync.Once guarded, so only the first
// read would ever take effect for the whole test binary.
//
//nolint:paralleltest // t.Setenv is incompatible with t.Parallel
func TestLoadJWTSecretValidation(t *testing.T) {
	// setProductionPrereqs satisfies every OTHER validation Load enforces outside development,
	// so each subtest's outcome depends only on JWT_SECRET rather than on drift in an unrelated
	// check this test does not care about.
	setProductionPrereqs := func(t *testing.T) {
		t.Helper()
		t.Setenv("APP_ENV", "production")
		t.Setenv("CORS_ORIGINS", "https://example.mn")
		t.Setenv("NOTIFY_DRIVER", "ses")
		t.Setenv("NOTIFY_TO", "owner@example.mn")
		t.Setenv("SES_FROM", "noreply@example.mn")
	}

	t.Run("production with no JWT_SECRET is refused, naming it", func(t *testing.T) {
		setProductionPrereqs(t)
		t.Setenv("JWT_SECRET", "")

		_, err := conf.Load()
		if err == nil {
			t.Fatal("Load() error = nil, want error for missing JWT_SECRET")
		}
		if !strings.Contains(err.Error(), "JWT_SECRET") {
			t.Errorf("Load() error = %q, want it to name JWT_SECRET", err.Error())
		}
	})

	t.Run("production with a 10-character secret is refused, saying why", func(t *testing.T) {
		setProductionPrereqs(t)
		t.Setenv("JWT_SECRET", "short1234x")

		_, err := conf.Load()
		if err == nil {
			t.Fatal("Load() error = nil, want error for a too-short JWT_SECRET")
		}
		if !strings.Contains(err.Error(), "32") {
			t.Errorf("Load() error = %q, want it to say the length floor", err.Error())
		}
	})

	t.Run("production with a 32-character secret starts", func(t *testing.T) {
		setProductionPrereqs(t)
		secret := strings.Repeat("a", 32)
		t.Setenv("JWT_SECRET", secret)

		cfg, err := conf.Load()
		if err != nil {
			t.Fatalf("Load() error = %v, want nil for a 32-character secret", err)
		}
		if cfg.JWT.Secret != secret {
			t.Errorf("JWT.Secret = %q, want %q", cfg.JWT.Secret, secret)
		}
	})

	t.Run("development with no JWT_SECRET uses the documented default", func(t *testing.T) {
		t.Setenv("APP_ENV", "development")
		t.Setenv("CORS_ORIGINS", "")
		t.Setenv("NOTIFY_DRIVER", "")
		t.Setenv("JWT_SECRET", "")

		cfg, err := conf.Load()
		if err != nil {
			t.Fatalf("Load() error = %v, want nil in development", err)
		}
		if cfg.JWT.Secret == "" {
			t.Error("JWT.Secret is empty, want the development default")
		}
	})
}
