package routes

import (
	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers"
	"landing-api/internal/utils/secure"
)

// noStore marks every admin response uncacheable, since leads hold personal data. It runs before
// AuthMiddleware so a 401 is covered too.
func noStore(c *fiber.Ctx) error {
	c.Set(fiber.HeaderCacheControl, "no-store")
	return c.Next()
}

// setupAdminRoutes mounts every route that requires a valid access token.
func setupAdminRoutes(api fiber.Router, h *handlers.Handlers, tokenService *secure.TokenService) {
	admin := api.Group("/admin", noStore, handlers.AuthMiddleware(tokenService))
	admin.Get("/leads", h.Lead.List)
}
