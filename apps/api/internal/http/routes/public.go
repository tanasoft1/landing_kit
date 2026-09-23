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

// loginLimiter caps attempts per client against /api/auth/login. This is the only public,
// unauthenticated endpoint where guessing is the attack, so unlike /api/leads this limiter guards
// a credential check rather than a spam-prone form.
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

// refreshLimiter caps refreshes per client. Far looser than loginLimiter, because it is guarding
// something else.
//
// Refresh shared loginLimiter's five per fifteen minutes, counting successes, and the panel
// refreshes once per fresh tab and once per reload by design, because the access token is
// memory-only. Six reloads in a morning is ordinary, and the sixth got a 429 and a trip back to
// the login form. Behind office NAT several admins share one bucket and reach it sooner, and a
// stranger on that NAT could spend the five on garbage and lock every admin behind that address
// out for the quarter hour.
//
// Thirty is still a bound worth having, and it is cheap to be generous here: a refresh presented
// without a valid cookie grants nothing at all, so there is no secret to guess at this endpoint
// the way there is at login.
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

// csrfHeader is the header /api/auth/refresh and /api/auth/logout require. The name is the old
// XMLHttpRequest convention because it is the one a reader recognises; nothing is checked but its
// presence, and nothing needs to be. Its whole value is that a browser will not let a page set it
// on a cross-origin request without asking permission first.
const csrfHeader = "X-Requested-With"

// requireNonSimpleRequest refuses a request that did not set csrfHeader.
//
// SameSite=Strict on the refresh cookie is what internal/http/handlers/auth/cookie.go points at
// instead of CSRF tokens, and for a genuinely cross-site request that is right: the cookie is not
// attached at all. SameSite is evaluated per site, though, not per origin, so a sibling subdomain
// is the same site and its requests do carry the cookie. Logout and refresh take no body and no
// custom header, which made them CORS-simple: any page on any subdomain -- a customer's blog on
// blog.example.com -- could fire either from a hidden form and the browser would attach the
// cookie with no preflight to stop it. It could not read the answer, so nothing leaked, but it
// could sign the admin out whenever it liked, and it could rotate the cookie underneath a live
// tab.
//
// Requiring a header no simple request may set closes that, because a cross-origin caller now has
// to pass a preflight the CORS allowlist governs. The panel is same-origin, so it pays no
// preflight for this.
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
	api.Post("/auth/refresh", refreshLimiter(), requireNonSimpleRequest, h.Auth.Refresh)

	// Not behind AuthMiddleware, and not behind a limiter. It authenticates with the refresh
	// cookie rather than an access token, so it still works once the access token has expired --
	// which is exactly when someone is most likely to click Sign out. It is not a guessing
	// target: it reveals nothing and grants nothing.
	api.Post("/auth/logout", requireNonSimpleRequest, h.Auth.Logout)
}
