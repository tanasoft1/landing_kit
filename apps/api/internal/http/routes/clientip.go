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
//
// What it cannot do is recover the truth from a proxy that does not append the address it saw. If
// yours passes the caller's header through untouched, every field in it is the caller's and no
// amount of parsing changes that; name a header the proxy writes itself instead, such as X-Real-IP.
func normalizeClientIP(proxyHeader string, trustedProxies []string) fiber.Handler {
	trusted := parseTrusted(trustedProxies)

	return func(c *fiber.Ctx) error {
		if proxyHeader == "" || !c.IsProxyTrusted() {
			return c.Next()
		}

		// PeekAll, not c.Get. A repeated header field is one comma-joined list per RFC 9110, and
		// c.Get reads only the FIRST line of that name. HAProxy's `option forwardfor` adds its own
		// line rather than editing the caller's, so a caller who sends one line of their own gets
		// it read in full and the proxy's line -- the only honest one -- never looked at. Reading
		// one line there is not a partial fix, it is the whole attack back again.
		var fields []string
		for _, line := range c.Request().Header.PeekAll(proxyHeader) {
			fields = append(fields, strings.Split(string(line), ",")...)
		}
		if len(fields) == 0 {
			return c.Next()
		}

		client := c.Context().RemoteIP()

		// Right to left. The first field that is not a trusted proxy is the furthest point in the
		// chain whose value infrastructure vouched for; anything beyond it is hearsay.
		for i := len(fields) - 1; i >= 0; i-- {
			ip := parseForwardedIP(fields[i])
			if ip == nil {
				// A field that is not an address at all breaks the chain: nothing to its left can
				// be attributed to a proxy any more, so stop rather than keep walking past it.
				break
			}
			if isTrustedIP(ip, trusted) {
				continue
			}
			client = ip
			break
		}

		// Del before Set, or a repeated field keeps every line after the first and the walk above
		// reads a list this one never wrote.
		//
		// String() and not the raw field: Fiber re-validates whatever is here with its own IsIPv4
		// and IsIPv6, which disagree with net.ParseIP about "::ffff:198.51.100.50" and reject it.
		// A rejected value sends c.IP() back to the socket peer, which puts every caller behind the
		// proxy in one bucket -- the failure this whole file exists to prevent, arriving quietly.
		// net.IP.String() writes the dotted-quad form for a v4-mapped address, which both accept.
		c.Request().Header.Del(proxyHeader)
		c.Request().Header.Set(proxyHeader, client.String())
		return c.Next()
	}
}

// parseForwardedIP reads one field of ProxyHeader, in the forms proxies actually write.
//
// A bare address is the common case. Azure App Service appends the source port ("1.2.3.4:53422"),
// and the bracketed form ("[2001:db8::1]:443") is what RFC 7239 uses for IPv6 with a port. A zone
// identifier ("fe80::1%eth0") means nothing off the host that wrote it, so it is dropped rather
// than carried. Every one of these used to fail net.ParseIP outright and break the walk, which
// collapsed every caller onto the proxy's own address.
func parseForwardedIP(field string) net.IP {
	field = strings.TrimSpace(field)
	if field == "" {
		return nil
	}
	if ip := net.ParseIP(field); ip != nil {
		return ip
	}
	if host, _, err := net.SplitHostPort(field); err == nil {
		if ip := net.ParseIP(host); ip != nil {
			return ip
		}
	}
	if zone := strings.IndexByte(field, '%'); zone > 0 {
		if ip := net.ParseIP(field[:zone]); ip != nil {
			return ip
		}
	}
	return nil
}

// trustedRange is one entry of TRUSTED_PROXIES, which conf.Load has already accepted as either a
// bare address or a CIDR range.
//
// Parsed here as well as by Fiber, which keeps its own copy private. Two readers of one setting is
// worth less than a fork of the setting itself, so this reads the same strings conf handed Fiber
// and never a list of its own.
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
