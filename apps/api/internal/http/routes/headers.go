package routes

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// contentSecurityPolicy does not prevent XSS: 'unsafe-inline' stays because the static pages carry
// three inline scripts with no nonce. connect-src and img-src stop an injected script from quietly
// sending a stolen access token to another host.
const contentSecurityPolicy = "default-src 'self'; " +
	"script-src 'self' 'unsafe-inline'; " +
	"style-src 'self' 'unsafe-inline'; " +
	"img-src 'self' data:; " +
	"font-src 'self'; " +
	"connect-src 'self'; " +
	"object-src 'none'; " +
	"base-uri 'none'; " +
	"frame-ancestors 'none'; " +
	"form-action 'self'"

// hstsValue is two years with subdomains, sent outside development. No preload: that is a one-way
// choice each client should make. Turning the header off does not undo it; serve max-age=0 instead.
const hstsValue = "max-age=63072000; includeSubDomains"

// securityHeaders sets CSP and HSTS and overrides some helmet defaults. It uses c.Set, not
// helmet.Config, because a renamed helmet field silently stops sending the header.
func securityHeaders(isProduction bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set(fiber.HeaderContentSecurityPolicy, contentSecurityPolicy)
		c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
		c.Set(fiber.HeaderXFrameOptions, "DENY")
		c.Set(fiber.HeaderReferrerPolicy, "strict-origin-when-cross-origin")

		// The site keeps referral attribution. Admin URLs must never leak through a link.
		// Match whole segments, so /administration is not caught.
		if path := c.Path(); path == "/admin" || strings.HasPrefix(path, "/admin/") {
			c.Set(fiber.HeaderReferrerPolicy, "no-referrer")
		}

		if isProduction {
			c.Set(fiber.HeaderStrictTransportSecurity, hstsValue)
		}
		return c.Next()
	}
}
