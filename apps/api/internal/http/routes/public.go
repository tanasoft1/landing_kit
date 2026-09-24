package routes

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"
	"github.com/google/uuid"

	"landing-api/internal/http/handlers"
	"landing-api/internal/http/models"
)

// clientKeyGenerator gives a caller with no address a unique key, not a shared "" bucket, so one
// spammer or attacker cannot lock out everyone. EnableIPValidation makes this unreachable today;
// keep it in case that setting changes.
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

// loginLimiter caps attempts per client against /api/auth/login.
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

// refreshLimiter is far looser than loginLimiter. The panel refreshes on every reload, and there
// is no secret to guess here.
func refreshLimiter() fiber.Handler {
	return limiter.New(limiter.Config{
		Max:          30,
		Expiration:   15 * time.Minute,
		KeyGenerator: clientKeyGenerator,
		LimitReached: func(c *fiber.Ctx) error {
			return c.Status(fiber.StatusTooManyRequests).JSON(models.ErrorResponse{
				Error: "rate limited", Message: "Хэт олон удаа оролдлоо. Дараа дахин оролдоно уу.",
			})
		},
	})
}

// csrfHeader must be present on refresh and logout. Only its presence is checked: a cross-origin
// page cannot set it without a CORS preflight.
const csrfHeader = "X-Requested-With"

// requireNonSimpleRequest refuses a request that did not set csrfHeader. SameSite=Strict still
// lets a sibling subdomain send the cookie, so without this any subdomain page could log the admin
// out or rotate the cookie from a hidden form.
func requireNonSimpleRequest(c *fiber.Ctx) error {
	if c.Get(csrfHeader) == "" {
		return c.Status(fiber.StatusForbidden).JSON(models.ErrorResponse{
			Error: "forbidden", Message: "Хүсэлт хүлээн зөвшөөрөгдөхгүй.",
		})
	}
	return c.Next()
}

func setupPublicRoutes(api fiber.Router, h *handlers.Handlers) {
	api.Post("/leads", leadLimiter(), h.Lead.Create)
	api.Post("/auth/login", loginLimiter(), h.Auth.Login)
	// The header check runs before the limiter. Forged requests come from the admin's own IP, and
	// counting them would spend the admin's refresh budget.
	api.Post("/auth/refresh", requireNonSimpleRequest, refreshLimiter(), h.Auth.Refresh)

	// No AuthMiddleware: logout uses the refresh cookie, so it works after the access token expires.
	api.Post("/auth/logout", requireNonSimpleRequest, h.Auth.Logout)
}
