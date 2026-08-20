package routes

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/google/uuid"

	"landing-api/internal/http/handlers"
	"landing-api/internal/http/models"
)

// leadLimiter caps submissions per client. The KeyGenerator is the whole point of this function.
//
// psyfint_v2_back removed its per-IP limiter after finding that Fiber's c.IP() returns "" whenever
// ProxyHeader is configured and that header does not arrive, which put every caller in ONE bucket.
// On a public contact form that means a single spammer locks out every real visitor.
//
// So an unresolvable IP gets a unique key instead of a shared one: the request goes unlimited
// rather than joining everyone else's bucket. That fails open for one request and never locks out
// a real person. The honeypot and the timing floor are the primary defences; this is depth, and
// depth that can deny service is worse than none.
func leadLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:        5,
		Expiration: 10 * time.Minute,
		KeyGenerator: func(c *fiber.Ctx) string {
			if ip := c.IP(); ip != "" {
				return ip
			}
			return uuid.NewString()
		},
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
				Error: "rate limited", Message: "Хэт олон удаа илгээсэн. Дараа дахин оролдоно уу.",
			})
		},
	})
}

func setupPublicRoutes(api fiber.Router, h *handlers.Handlers) {
	api.Post("/leads", leadLimiter(), h.Lead.Create)
}
