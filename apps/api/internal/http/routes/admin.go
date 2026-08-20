package routes

import (
	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers"
	"landing-api/internal/utils/secure"
)

// setupAdminRoutes mounts every route that requires a valid access token. Split from
// setupPublicRoutes so the auth boundary is visible at a glance: everything registered here goes
// through handlers.AuthMiddleware first, and nothing registered in public.go does.
func setupAdminRoutes(api fiber.Router, h *handlers.Handlers, tokenService *secure.TokenService) {
	admin := api.Group("/admin", handlers.AuthMiddleware(tokenService))
	admin.Get("/leads", h.Lead.List)
}
