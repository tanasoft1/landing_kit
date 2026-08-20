package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/helmet"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"

	"landing-api/internal/http/handlers"
)

// Setup mounts the global middleware chain and every route group.
//
// No global rate limiter. The only limited route is POST /api/leads, and its limiter needs a key
// generator that cannot collapse callers into one bucket (see internal/http/routes/public.go).
func Setup(app *fiber.App, h *handlers.Handlers, corsOrigins string) {
	app.Use(recover.New())
	app.Use(logger.New())
	app.Use(helmet.New())
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
}
