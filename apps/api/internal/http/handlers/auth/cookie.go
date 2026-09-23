package authhandler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// RefreshCookieName is where the refresh token lives. Prefixed so it cannot collide with a cookie
// the site itself sets.
const RefreshCookieName = "landing_refresh"

// refreshCookiePath scopes the cookie to the three endpoints that consume it: login, refresh and
// logout. Every /api/admin/* request then goes out without it, which is the point -- a credential
// that is not sent cannot be stolen in transit, logged by a proxy, or replayed from an access log.
const refreshCookiePath = "/api/auth"

// setRefreshCookie writes the refresh token as a cookie no script can read.
//
// secure is false only in development, where the dev server speaks plain HTTP to localhost and a
// Secure cookie would simply never be stored. Everywhere else it is on, so the token cannot cross
// an unencrypted hop.
//
// SameSite=Strict stops a genuinely cross-site request from carrying the cookie at all, which is
// most of what a CSRF token would buy. Not all of it: SameSite is evaluated per site, not per
// origin, so a sibling subdomain is the same site and its requests do arrive with this cookie
// attached. That is why /api/auth/refresh and /api/auth/logout also require a header no
// CORS-simple request can set -- see requireNonSimpleRequest in internal/http/routes/public.go.
func setRefreshCookie(c *fiber.Ctx, token string, expiresAt time.Time, secure bool) {
	c.Cookie(&fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    token,
		Path:     refreshCookiePath,
		Expires:  expiresAt,
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Strict",
	})
}

// clearRefreshCookie expires the cookie. Path must match setRefreshCookie's exactly, or the
// browser treats it as a different cookie and quietly keeps the original.
func clearRefreshCookie(c *fiber.Ctx, secure bool) {
	c.Cookie(&fiber.Cookie{
		Name:     RefreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		Expires:  time.Now().Add(-time.Hour),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Strict",
	})
}
