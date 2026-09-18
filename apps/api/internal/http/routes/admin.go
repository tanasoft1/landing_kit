package routes

import (
	"github.com/gofiber/fiber/v2"

	"landing-api/internal/http/handlers"
	"landing-api/internal/utils/secure"
)

// noStore marks every admin response uncacheable.
//
// GET /api/admin/leads carries names, emails, message bodies, IP addresses and user agents. A
// shared proxy or a browser's back-forward cache holding a copy of that is a disclosure nobody
// would find until it mattered. Set on the group rather than per handler, so a route added later
// cannot forget it.
//
// Registered ahead of AuthMiddleware, not after it. A rejected request never reaches the next
// handler, so running this second would leave every 401 with no cache directive at all -- the one
// class of admin response an unauthenticated caller can actually get a proxy to store.
func noStore(c *fiber.Ctx) error {
	c.Set(fiber.HeaderCacheControl, "no-store")
	return c.Next()
}

// setupAdminRoutes mounts every route that requires a valid access token. Split from
// setupPublicRoutes so the auth boundary is visible at a glance: everything registered here goes
// through handlers.AuthMiddleware, and nothing registered in public.go does.
func setupAdminRoutes(api fiber.Router, h *handlers.Handlers, tokenService *secure.TokenService) {
	admin := api.Group("/admin", noStore, handlers.AuthMiddleware(tokenService))
	admin.Get("/leads", h.Lead.List)
}
