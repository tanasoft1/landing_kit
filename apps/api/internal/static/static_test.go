package static_test

import (
	"testing"

	"landing-api/internal/static"
)

// A fresh clone (and CI) never has more than dist/.placeholder committed, so HasSite must read
// false there. If this ever reads true against a clean checkout, `all:dist` picked up a build
// artifact that got committed by mistake.
func TestHasSiteFalseOnFreshClone(t *testing.T) {
	t.Parallel()

	if static.HasSite() {
		t.Error("HasSite() = true, want false with only dist/.placeholder present")
	}
}
