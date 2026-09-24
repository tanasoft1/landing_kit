package authhandler

import (
	"time"

	"github.com/gofiber/fiber/v2"
)

// RefreshCookieName is where the refresh token lives.
const RefreshCookieName = "landing_refresh"

// refreshCookiePath keeps the cookie off every /api/admin/* request.
const refreshCookiePath = "/api/auth"

// setRefreshCookie writes the refresh token as an HttpOnly cookie. secure is false only in
// development, over plain HTTP. SameSite=Strict still lets sibling subdomains send it, which is
// why refresh and logout also require csrfHeader.
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

// clearRefreshCookie expires the cookie. Path must match setRefreshCookie's, or the browser keeps the original.
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
