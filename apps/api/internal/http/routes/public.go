package routes

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/google/uuid"

	"landing-api/internal/http/handlers"
	"landing-api/internal/http/models"
)

// clientKeyGenerator is shared by every rate limiter below. It never collapses every caller into
// one bucket.
//
// psyfint_v2_back removed its per-IP limiter after finding that Fiber's c.IP() returns "" whenever
// ProxyHeader is configured and that header does not arrive, which put every caller in ONE bucket.
// On a public contact form that means a single spammer locks out every real visitor; on a login
// endpoint it means one attacker's guesses lock out every admin trying to sign in.
//
// So an unresolvable IP gets a unique key instead of a shared one: the request goes unlimited
// rather than joining everyone else's bucket. That fails open for one request and never locks out
// a real caller. The honeypot and the timing floor are the contact form's primary defences, and
// bcrypt plus the identical error message are the login endpoint's; this is depth for both, and
// depth that can deny service is worse than none.
func clientKeyGenerator(c *fiber.Ctx) string {
	if ip := c.IP(); ip != "" {
		return ip
	}
	return uuid.NewString()
}

// leadLimiter caps submissions per client.
func leadLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:          5,
		Expiration:   10 * time.Minute,
		KeyGenerator: clientKeyGenerator,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
				Error: "rate limited", Message: "Хэт олон удаа илгээсэн. Дараа дахин оролдоно уу.",
			})
		},
	})
}

// loginLimiter caps attempts per client against /api/auth/login and /api/auth/refresh. These are
// the only public, unauthenticated endpoints where guessing is the attack, so unlike /api/leads
// this limiter guards a credential check rather than a spam-prone form.
func loginLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:          5,
		Expiration:   15 * time.Minute,
		KeyGenerator: clientKeyGenerator,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
				Error: "rate limited", Message: "Хэт олон удаа оролдлоо. Дараа дахин оролдоно уу.",
			})
		},
	})
}

func setupPublicRoutes(api fiber.Router, h *handlers.Handlers) {
	api.Post("/leads", leadLimiter(), h.Lead.Create)
	api.Post("/auth/login", loginLimiter(), h.Auth.Login)
	api.Post("/auth/refresh", loginLimiter(), h.Auth.Refresh)
}
