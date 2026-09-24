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

// distFS holds the web build, or just dist/.placeholder on a fresh clone. go:embed fails on an
// empty match, so keep the placeholder. `all:` is needed to include a dotfile.
//
//go:embed all:dist
var distFS embed.FS

// HasSite reports whether a real web build was embedded. It checks for index.html, because
// `make build` leaves the placeholder in place.
func HasSite() bool {
	_, err := distFS.Open("dist/index.html")
	return err == nil
}

// HasAdmin reports whether the embedded build includes the admin panel's shell. A site can ship without one.
func HasAdmin() bool {
	_, err := distFS.Open("dist/admin/index.html")
	return err == nil
}

// Handler serves the embedded site. Call it only when HasSite is true, and mount it after every
// API route. Paths under /api pass through, so a mistyped API path gets the API's 404.
func Handler() fiber.Handler {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic("static: embed sub: " + err.Error())
	}
	fsHandler := filesystem.New(filesystem.Config{
		Root: http.FS(sub),
		// Not a wildcard route: /contact/ must resolve to its own index.html first.
		NotFoundFile: "index.html",
		Browse:       false,
	})

	// The root index.html is the home page, so admin paths fall back to the panel shell instead.
	// Otherwise a hard load of /admin/leads flashes the home page.
	adminHandler := filesystem.New(filesystem.Config{
		Root:         http.FS(sub),
		NotFoundFile: "admin/index.html",
		Browse:       false,
	})
	hasAdmin := HasAdmin()

	return func(c *fiber.Ctx) error {
		path := c.Path()
		if strings.HasPrefix(path, "/api") {
			return c.Next()
		}
		// Match whole segments, so /administration/ stays with the site.
		if hasAdmin && (path == "/admin" || strings.HasPrefix(path, "/admin/")) {
			// A stale shell after a deploy would hydrate against a bundle that no longer matches.
			c.Set(fiber.HeaderCacheControl, "no-store")
			return adminHandler(c)
		}
		return fsHandler(c)
	}
}
