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
func Setup(app *fiber.App, h *handlers.Handlers, corsOrigins string, tokenService *secure.TokenService, isProduction bool, proxyHeader string, trustedProxies []string) {
	app.Use(recover.New())
	// Before the logger and the limiters, which all read c.IP().
	app.Use(normalizeClientIP(proxyHeader, trustedProxies))
	app.Use(logger.New())
	app.Use(helmet.New(helmet.Config{
		// Helmet's defaults block most third-party widgets and CDN assets, with no server-side
		// error. These are the browser defaults.
		CrossOriginEmbedderPolicy: "unsafe-none",
		CrossOriginResourcePolicy: "cross-origin",
	}))
	app.Use(securityHeaders(isProduction))
	app.Use(cors.New(cors.Config{
		AllowOrigins: corsOrigins,
		// Authorization carries the access token. X-Requested-With is the csrfHeader.
		AllowHeaders: "Origin, Content-Type, Accept, Authorization, X-Requested-With",
		AllowMethods: "GET, POST, OPTIONS",
		// Lets the refresh cookie travel for a same-site split like admin.example.com calling
		// api.example.com. Because of this, conf.Load rejects any "*" in CORS_ORIGINS.
		AllowCredentials: true,
	}))

	api := app.Group("/api")
	api.Get("/health", func(c *fiber.Ctx) error {
		// Monitoring checks depend on this exact shape.
		return c.JSON(fiber.Map{"status": "ok", "message": "server is running"})
	})

	setupPublicRoutes(api, h)
	setupAdminRoutes(api, h, tokenService)

	// Mounted last, or its catch-all would answer unmatched API paths. Skipped in an API-only build.
	if static.HasSite() {
		app.Use(static.Handler())
	} else {
		slog.Warn("no web build embedded, serving API only -- run `make build` in the API directory to embed the site")
	}
}
