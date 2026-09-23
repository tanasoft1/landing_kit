// Package static embeds the web build's output so one binary can serve both the API and the
// prerendered site.
package static

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/filesystem"
)

// distFS holds the web build's output, or just dist/.placeholder on a fresh clone.
//
// `//go:embed` is a build error when its pattern matches nothing (the migrations package hit
// exactly this: it would not compile until a `.sql` file existed). The web build output is a
// build artifact and must never be committed, so without the committed placeholder this pattern
// would match nothing on a fresh clone and `go build ./...` would fail before anyone had run a
// web build.
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

// HasAdmin reports whether the embedded build includes the admin panel's shell.
//
// Checked separately from HasSite because the two are independent: a project scaffolded with
// --backend=api embeds a site with no panel in it, and mounting an admin fallback with no
// admin/index.html behind it would answer every /admin path with a bare 404.
func HasAdmin() bool {
	_, err := distFS.Open("dist/admin/index.html")
	return err == nil
}

// Handler serves the embedded site. Call only when HasSite reports true: with just the
// placeholder, dist has no index.html, so filesystem.New would have nothing to fall back to on
// every request.
//
// /api is passed straight through with c.Next(), never served from the embedded tree, so a
// mistyped API path falls through to the API's own 404 handling instead of the site's index.html.
// Mount this last, after every API route (see internal/http/routes.Setup): mounted earlier, the
// site's own catch-all would answer for every unmatched path before an API route ever saw it.
//
// /api is the only reserved prefix. A service that owns more paths server-side would need each
// one excluded here the same way.
func Handler() fiber.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("static: embed sub: " + err.Error())
	}
	fsHandler := filesystem.New(filesystem.Config{
		Root: http.FS(sub),
		// NotFoundFile, not a wildcard route: a prerendered page like /contact/ must resolve to
		// its OWN index.html first, and only a genuinely unknown path falls back to the root one
		// so the client router can render the site's own Not Found page.
		NotFoundFile: "index.html",
		Browse:       false,
	})

	// A second handler with a different fallback, for one reason: the root index.html is the
	// prerendered HOME PAGE. Falling back to it for /admin/leads paints the hero, then hydrates,
	// then swaps in the panel -- a flash of the wrong site on every hard load of an admin URL.
	// admin/index.html is the prerendered panel shell, which renders a skeleton, so the same
	// fallback shows a loading state instead.
	adminHandler := filesystem.New(filesystem.Config{
		Root:         http.FS(sub),
		NotFoundFile: "admin/index.html",
		Browse:       false,
	})
	// Read once at construction: the embedded filesystem cannot change while the process runs, so
	// checking it per request would be a wasted Open on the hot path.
	hasAdmin := HasAdmin()

	return func(c *fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/api") {
			return c.Next()
		}
		// Matched on whole segments, not as a bare prefix: a site page under /administration/
		// belongs to the site, and an unknown path below it must reach the site's own Not Found
		// page rather than the panel's skeleton.
		if hasAdmin && (path == "/admin" || strings.HasPrefix(path, "/admin/")) {
			// Never cached. The markup is only a skeleton, but a stale one served after a
			// deploy hydrates against a bundle that no longer matches it. Caching is all this
			// line does. Whether the panel gets indexed is decided in the frontend's route
			// head, not by any header here.
			c.Set(fiber.HeaderCacheControl, "no-store")
			return adminHandler(c)
		}
		return fsHandler(c)
	}
}
