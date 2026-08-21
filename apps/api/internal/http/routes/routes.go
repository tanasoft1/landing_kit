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
func Setup(app *fiber.App, h *handlers.Handlers, corsOrigins string, tokenService *secure.TokenService) {
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
	app.Use(cors.New(cors.Config{
		AllowOrigins: corsOrigins,
		AllowHeaders: "Origin, Content-Type, Accept",
		AllowMethods: "GET, POST, OPTIONS",
	}))

	api := app.Group("/api")
	api.Get("/health", func(c *fiber.Ctx) error {
		// Same payload as psyfint_v2_back's, so a monitoring check written against one service
		// works unchanged against the other.
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
		slog.Warn("no web build embedded, serving API only -- run `make build` in apps/api to embed the site")
	}
}
