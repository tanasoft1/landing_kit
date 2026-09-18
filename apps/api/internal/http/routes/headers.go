package routes

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// contentSecurityPolicy is what the browser is allowed to load and reach.
//
// Read 'unsafe-inline' in script-src before assuming this prevents XSS. It does not, and it
// cannot: components/theme-script.tsx has to run before first paint to avoid a flash of the wrong
// theme, and TanStack Start emits inline hydration data. Both are inline scripts with no nonce,
// because the pages are static files rather than per-request renders.
//
// What it does instead is contain XSS, and connect-src is the line that matters. An injected
// script cannot POST a stolen access token to an attacker's host, because it cannot open a
// connection off-origin at all. Combined with the refresh token being unreadable from JavaScript
// (see handlers/auth/cookie.go), the best an attacker gets from an injection is acting inside the
// page while it is open, rather than walking away with a week of access.
//
// base-uri and object-src close two holes 'unsafe-inline' leaves reachable: retargeting every
// relative URL on the page, and embedding a plugin document.
//
// Removing 'unsafe-inline' means hashing both inline scripts at build time and listing the
// hashes here. apps/web/src/lib/seo/emit-plugin.ts already post-processes build output, so that
// is reachable later. Until then, do not describe this policy as XSS prevention.
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

// hstsValue is two years with subdomains, the usual preload-eligible value. Production only:
// sending it from a development server over plain HTTP does nothing, and sending it from a
// staging box on a shared parent domain would pin HTTPS for siblings that may not have it.
const hstsValue = "max-age=63072000; includeSubDomains"

// securityHeaders sets the headers helmet is not configured for.
//
// Written as explicit c.Set calls rather than through helmet.Config on purpose. Helmet's field
// names move between versions, and a renamed field fails by silently not sending the header,
// which is the worst possible failure mode for a security control: everything still works, and
// nothing says the protection is gone. Six lines against a CSP reference are also easier to
// review than a struct literal.
func securityHeaders(isProduction bool) fiber.Handler {
	return func(c *fiber.Ctx) error {
		c.Set(fiber.HeaderContentSecurityPolicy, contentSecurityPolicy)
		c.Set(fiber.HeaderXContentTypeOptions, "nosniff")
		c.Set(fiber.HeaderXFrameOptions, "DENY")
		c.Set(fiber.HeaderReferrerPolicy, "strict-origin-when-cross-origin")

		// no-referrer only for the panel. An admin URL must never reach a third party through an
		// outbound link, while the public site keeps the default so ordinary referral
		// attribution still works.
		if strings.HasPrefix(c.Path(), "/admin") {
			c.Set(fiber.HeaderReferrerPolicy, "no-referrer")
		}

		if isProduction {
			c.Set(fiber.HeaderStrictTransportSecurity, hstsValue)
		}
		return c.Next()
	}
}
