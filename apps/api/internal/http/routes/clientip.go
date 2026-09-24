package routes

import (
	"net"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// normalizeClientIP collapses ProxyHeader down to the one address this service will treat as the
// client, and it has to exist because Fiber reads that header from the LEFT.
//
// Fiber's c.IP() returns the first syntactically valid address in ProxyHeader. Every common proxy
// APPENDS to X-Forwarded-For rather than replacing it -- an ALB does, and so does nginx's
// $proxy_add_x_forwarded_for -- so the header a handler sees is "<whatever the caller sent>,
// <the address the proxy actually observed>". The leftmost field is therefore written by the
// caller, and the caller is who these limits are meant to be applied to.
//
// Two attacks come out of that, and the second is the worse one. A caller who sends
// "X-Forwarded-For: <an admin's address>" is keyed as that admin and can lock them out of the
// panel. A caller who sends a different value on every request gets a fresh rate-limit bucket and
// a fresh login-backoff row each time, so neither limit ever reaches its threshold.
//
// The address to trust is the rightmost one that is not itself a proxy we trust: everything to the
// right of it was written by infrastructure, everything to the left could have been written by
// anyone. This runs before the limiters and rewrites the header to that single value, so c.IP()
// answers correctly everywhere -- the limiters, the login backoff, and the audit log -- rather than
// each caller having to remember which of the two answers it wanted.
//
// It is a no-op when there is no ProxyHeader to read, and when the request did not arrive from a
// trusted proxy, because Fiber ignores the header in both cases and c.IP() is already the peer.
func normalizeClientIP(proxyHeader string, trustedProxies []string) fiber.Handler {
	trusted := parseTrusted(trustedProxies)

	return func(c *fiber.Ctx) error {
		if proxyHeader == "" || !c.IsProxyTrusted() {
			return c.Next()
		}

		peer := c.Context().RemoteIP().String()
		client := peer

		// Right to left. The first field that is not a trusted proxy is the furthest point in the
		// chain whose value infrastructure vouched for; anything beyond it is hearsay.
		fields := strings.Split(c.Get(proxyHeader), ",")
		for i := len(fields) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(fields[i])
			ip := net.ParseIP(candidate)
			if ip == nil {
				// A field that is not an address at all breaks the chain: nothing to its left can
				// be attributed to a proxy any more, so stop rather than keep walking past it.
				break
			}
			if isTrustedIP(ip, trusted) {
				continue
			}
			client = candidate
			break
		}

		c.Request().Header.Set(proxyHeader, client)
		return c.Next()
	}
}

// trustedRange is one entry of TRUSTED_PROXIES, which conf.Load has already accepted as either a
// bare address or a CIDR range.
type trustedRange struct {
	ip  net.IP
	net *net.IPNet
}

func parseTrusted(entries []string) []trustedRange {
	out := make([]trustedRange, 0, len(entries))
	for _, entry := range entries {
		if _, network, err := net.ParseCIDR(entry); err == nil {
			out = append(out, trustedRange{net: network})
			continue
		}
		if ip := net.ParseIP(entry); ip != nil {
			out = append(out, trustedRange{ip: ip})
		}
	}
	return out
}

func isTrustedIP(ip net.IP, trusted []trustedRange) bool {
	for _, t := range trusted {
		if t.net != nil && t.net.Contains(ip) {
			return true
		}
		if t.ip != nil && t.ip.Equal(ip) {
			return true
		}
	}
	return false
}
