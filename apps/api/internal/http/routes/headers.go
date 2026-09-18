package routes

import (
	"strings"

	"github.com/gofiber/fiber/v2"
)

// contentSecurityPolicy is what the browser is allowed to load and reach.
//
// Read 'unsafe-inline' in script-src before assuming this prevents XSS. It does not, and it
// cannot: the theme script has to run before first paint to avoid a flash of the wrong theme, and
// TanStack Start emits two more of its own, a scroll restoration script and a stream barrier.
// Three inline scripts, none with a nonce, because the pages are static files rather than
// per-request renders.
//
// What it does instead is narrow XSS, and connect-src is the line that matters. An injected
// script cannot fetch, XHR or WebSocket a stolen access token to an attacker's host, and img-src
// closes the other quiet channel, a one-pixel image with the token in its query string.
//
// It does not close every channel, and nothing in CSP does. A script can still navigate the tab
// to an attacker's URL and put the token in it; the directive that would stop that, navigate-to,
// was dropped from the spec and ships in no browser. What the policy buys is that silent
// exfiltration costs the attacker a visible page change. Combined with the refresh token being
// unreadable from JavaScript (see handlers/auth/cookie.go), what an injection reaches is one
// access token and the page while it is open, not the week of access the refresh token carries.
//
// base-uri and object-src close two holes 'unsafe-inline' leaves reachable: retargeting every
// relative URL on the page, and embedding a plugin document.
//
// Removing 'unsafe-inline' means hashing all three scripts at build time and listing the hashes
// here. src/lib/seo/emit-plugin.ts is the build step that already post-processes the output, so
// it is where those hashes would come from. Until this policy carries them, it is not XSS
// prevention and should not be described as such.
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

// hstsValue is two years with subdomains. Not preload eligible: hstspreload.org requires the
// preload directive as well, and adding it is a one-way door a client should walk through
// deliberately rather than inherit from a scaffold.
//
// Sent for every APP_ENV except development, the same rule the CORS_ORIGINS check in
// conf/config.go applies and for the same reason: a staging deploy is a real deploy over real
// HTTPS and worth pinning. Development is excluded because a dev server speaks plain HTTP, where
// the header does nothing at all.
//
// What it costs is worth knowing before the first deploy that sends it. The browser then refuses
// plain HTTP to this host and to its subdomains for two years after the last response it saw, and
// backing out means serving max-age=0 until every visitor's cached entry expires -- switching the
// header off does not undo it. A sibling host is unaffected either way: includeSubDomains reaches
// a host's own subdomains, never its parent's other children.
const hstsValue = "max-age=63072000; includeSubDomains"

// securityHeaders sets the content security policy and HSTS, which helmet is not configured for,
// and overrides three headers helmet does send by default: nosniff (same value, set here so the
// whole set reads in one place), X-Frame-Options (SAMEORIGIN to DENY), and Referrer-Policy (see
// the branch below).
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

		// Two values, and the public one is deliberately the looser of the two. helmet already
		// sends no-referrer for everything; strict-origin-when-cross-origin relaxes that for the
		// marketing site so an outbound link still carries the origin and ordinary referral
		// attribution keeps working. The panel gets helmet's stricter value back, because an
		// admin URL must never reach a third party through a link at all.
		if strings.HasPrefix(c.Path(), "/admin") {
			c.Set(fiber.HeaderReferrerPolicy, "no-referrer")
		}

		if isProduction {
			c.Set(fiber.HeaderStrictTransportSecurity, hstsValue)
		}
		return c.Next()
	}
}
