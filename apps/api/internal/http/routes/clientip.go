package routes

import (
	"net"
	"strings"

	"github.com/gofiber/fiber/v2"
)

// normalizeClientIP rewrites ProxyHeader to the one address to treat as the client.
// Fiber's c.IP() reads the leftmost field, which the caller writes, since proxies append to
// X-Forwarded-For. Trusting it lets a caller pose as an admin or get a fresh rate-limit bucket per
// request. The client is the rightmost field that is not a trusted proxy.
// This only works with a proxy that appends the address it saw.
func normalizeClientIP(proxyHeader string, trustedProxies []string) fiber.Handler {
	trusted := parseTrusted(trustedProxies)

	return func(c *fiber.Ctx) error {
		if proxyHeader == "" || !c.IsProxyTrusted() {
			return c.Next()
		}

		// PeekAll, not c.Get: c.Get reads only the first line. HAProxy adds its own line, so the
		// honest value is on the last line.
		var fields []string
		for _, line := range c.Request().Header.PeekAll(proxyHeader) {
			fields = append(fields, strings.Split(string(line), ",")...)
		}
		if len(fields) == 0 {
			return c.Next()
		}

		client := c.Context().RemoteIP()

		for i := len(fields) - 1; i >= 0; i-- {
			ip := parseForwardedIP(fields[i])
			if ip == nil {
				// A non-address breaks the chain. Nothing to its left can be trusted.
				break
			}
			if isTrustedIP(ip, trusted) {
				continue
			}
			client = ip
			break
		}

		// Del before Set, or repeated lines after the first survive.
		// String(), not the raw field: Fiber rejects "::ffff:198.51.100.50", and a rejected value
		// puts every caller behind the proxy in one bucket.
		c.Request().Header.Del(proxyHeader)
		c.Request().Header.Set(proxyHeader, client.String())
		return c.Next()
	}
}

// parseForwardedIP reads one field of ProxyHeader. It accepts a bare address, one with a port
// (Azure App Service), and the bracketed IPv6 form. A zone like "%eth0" is dropped.
func parseForwardedIP(field string) net.IP {
	field = strings.TrimSpace(field)
	if field == "" {
		return nil
	}
	if ip := net.ParseIP(field); ip != nil {
		return ip
	}

	// SplitHostPort also removes the brackets.
	if host, _, err := net.SplitHostPort(field); err == nil {
		field = host
	} else {
		// No port, so brackets are still on: "[2001:db8::50]".
		field = strings.TrimSuffix(strings.TrimPrefix(field, "["), "]")
	}

	// Cutting at the first "%" also handles the "%25" spelling of RFC 6874.
	if zone := strings.IndexByte(field, '%'); zone > 0 {
		field = field[:zone]
	}

	return net.ParseIP(field)
}

// trustedRange is one TRUSTED_PROXIES entry. Fiber keeps its parsed copy private, so this parses
// the same strings again.
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
