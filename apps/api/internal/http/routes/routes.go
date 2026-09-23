package routes

import (
	"log/slog"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"landing-api/internal/http/handlers"
	"landing-api/internal/static"
	"landing-api/internal/utils/secure"
)

// Setup mounts the global middleware chain and every route group.
//
// No global rate limiter. The limited routes are POST /api/leads and the two /api/auth routes,
// and each needs a key generator that cannot collapse callers into one bucket (see
// internal/http/routes/public.go).
func Setup(app *fiber.App, h *handlers.Handlers, corsOrigins string, tokenService *secure.TokenService, isProduction bool) {
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(helmet.New(helmet.Config{
		// Both default to values that break a served site, and the breakage is browser-side with
		// no server-side signal. require-corp blocks every cross-origin subresource lacking a
		// matching CORP or CORS header, which is most third-party widgets and CDN assets;
		// same-origin blocks other origins from loading anything here. "unsafe-none" and
		// "cross-origin" are the browser defaults, so this restores normal behaviour rather than
		// weakening a protection this site relies on. Verified against Fiber v2.52.8's ConfigDefault.
		CrossOriginEmbedderPolicy: "unsafe-none",
		CrossOriginResourcePolicy: "cross-origin",
	}))
	app.Use(securityHeaders(isProduction))
	app.Use(cors.New(cors.Config{
		AllowOrigins: corsOrigins,
		// Authorization is listed because every /api/admin/* route reads the access token from
		// it. X-Requested-With is listed because /api/auth/refresh and /api/auth/logout require
		// it (see requireNonSimpleRequest in public.go). A browser refuses to send a header the
		// preflight response did not name, so leaving either out fails the request before the
		// handler sees it.
		AllowHeaders: "Origin, Content-Type, Accept, Authorization, X-Requested-With",
		AllowMethods: "GET, POST, OPTIONS",
		// What this buys, stated more narrowly than it used to be. The admin refresh token lives
		// in a cookie (see internal/http/handlers/auth/cookie.go), and a browser neither stores
		// nor sends a cookie on a cross-origin request unless the response says
		// Access-Control-Allow-Credentials: true.
		//
		// The case that used to be claimed here -- "the panel served from a different origin than
		// the API" -- is half impossible. The cookie is SameSite=Strict, and SameSite is evaluated
		// per site, not per origin, so a panel on a different registrable domain never receives or
		// sends that cookie whatever this header says. What does work, and what this is for, is
		// the same-site split: admin.example.com calling api.example.com is cross-origin, so CORS
		// applies, and same-site, so the Strict cookie travels. Nothing the kit generates is such
		// a client -- the panel reaches this API through Vite's /api proxy in development and
		// through the one binary in production, same-origin both times -- but people deploy that
		// shape and silently breaking it is worse than the narrowed risk.
		//
		// What this forbids: the origin allowlist can never contain a wildcard, bare or
		// subdomain-shaped. Fiber reflects a matching origin back, so with credentials on, any
		// host under "https://*.example.com" could call /api/auth/refresh with the admin's cookie
		// and read the fresh access token out of the response -- a subdomain takeover becoming
		// full panel access. conf.Load rejects every "*" in CORS_ORIGINS, so the failure names the
		// variable at startup rather than waiting for someone to find it.
		AllowCredentials: true,
	}))

	api := app.Group("/api")
	api.Get("/health", func(c *fiber.Ctx) error {
		// A flat {status, message} payload, and a stable one: monitoring checks are written
		// against this shape, so changing it breaks them silently.
		return c.JSON(fiber.Map{"status": "ok", "message": "server is running"})
	})

	setupPublicRoutes(api, h)
	setupAdminRoutes(api, h, tokenService)

	// Mounted last, and conditionally: an API-only binary (no web build ever embedded) is a
	// legitimate thing to run, and mounting a handler with no index.html to fall back on would
	// answer every page request with a confusing 404 instead of the API's own routes. Mounting
	// static.Handler() before the routes above, instead of after, would let its catch-all answer
	// for every unmatched path -- including a typo'd API route -- before an API handler ever saw
	// the request.
	if static.HasSite() {
		app.Use(static.Handler())
	} else {
		slog.Warn("no web build embedded, serving API only -- run `make build` in the API directory to embed the site")
	}
}
