// Package static embeds the web build's output so one binary can serve both the API and the
// prerendered site. Precedent: ~/work/psyfint_v2_back/internal/spa/spa.go.
package static

import "embed"

// distFS holds the web build's output, or just dist/.placeholder on a fresh clone.
//
// `//go:embed` is a build error when its pattern matches nothing (hit in phase 2a: the migrations
// package would not compile until a `.sql` file existed). The web build output is a build artifact
// and must never be committed, so without the committed placeholder this pattern would match
// nothing on a fresh clone and `go build ./...` would fail before anyone had run a web build.
//
// `all:dist`, not a bare `dist`: the `all:` prefix is what includes names starting with a dot, and
// dist/.placeholder is exactly such a name. A bare `dist` pattern silently excludes it, which would
// reintroduce the same fresh-clone build failure this file exists to prevent.
//
//go:embed all:dist
var distFS embed.FS

// HasSite reports whether a real web build was embedded, rather than just the placeholder that
// keeps `//go:embed` compilable on a fresh clone. Serving is conditional on it: an API-only binary
// is a legitimate thing to run, and answering every page request with a confusing 404 (the
// placeholder directory has no index.html) is not.
//
// Checked by looking for dist/index.html specifically, not by the placeholder's absence: `make
// build` (see ../../makefile) copies the web build in without deleting dist/.placeholder first, so
// the placeholder is present alongside a real build too.
func HasSite() bool {
	_, err := distFS.Open("dist/index.html")
	return err == nil
}
