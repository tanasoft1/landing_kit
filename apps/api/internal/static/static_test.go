package static_test

import (
	"testing"

	"landing-api/internal/static"
)

// A clean checkout has only dist/.placeholder. If this fails, a build artifact was committed.
func TestHasSiteFalseOnFreshClone(t *testing.T) {
	t.Parallel()

	if static.HasSite() {
		t.Error("HasSite() = true, want false with only dist/.placeholder present")
	}
}
