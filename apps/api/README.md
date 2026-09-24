# The Go API

`api/` is a GoFiber service on PostgreSQL. It stores the contact form's submissions, emails you
about each new lead, and lets an admin read them over `GET /api/admin/leads`. The marketing pages
stay static; this service never touches them.

## Running it

```bash
cp api/.env.example api/.env   # once
docker compose up -d db        # Postgres, on host port 5433
cd api && make run             # on PORT (default 3000). `make dev` hot-reloads if you have air.
```

Migrations run at startup, forward only. To change the schema, add a new migration with
`make migrate-create name=add_something` and write its `.up.sql`.

Postgres uses host port 5433 so it doesn't clash with one already on your machine. If you change
`DB_USER`, `DB_PASSWORD` or `DB_NAME`, change `POSTGRES_USER`, `POSTGRES_PASSWORD` and
`POSTGRES_DB` in `docker-compose.yml` too.

## Prerequisites

Go, Docker, `sqlc` and `golangci-lint`. `pnpm verify` runs `sqlc diff`, which fails if the
generated code in `internal/db/sqlc/` doesn't match the queries. Never edit that folder by hand.
`air` is optional.

## Connecting the contact form

The form posts to `VITE_CONTACT_ENDPOINT`. Set it in a `.env` at the project root:

```
VITE_CONTACT_ENDPOINT=http://localhost:3000/api/leads
```

`CORS_ORIGINS` already allows `http://localhost:5173`, Vite's dev port.

**Every `CORS_ORIGINS` entry must be a literal origin.** Any `*`, including
`https://*.example.com`, stops startup. Responses carry the admin's session cookie, so any host
that matches a wildcard could take over the panel.

The admin panel of a `--backend=admin` project needs no entry. It is same-origin: Vite proxies
`/api` in development, and one binary serves both in production. It can't move to another origin,
because it always sends `credentials: 'same-origin'`.

## Notifications

`NOTIFY_DRIVER=log` (the default) writes a log line. `NOTIFY_DRIVER=ses` sends email through AWS
SES and needs `NOTIFY_TO` and `SES_FROM`. With `APP_ENV=production`, `log` is refused, because
leads would be stored and nobody told.

## Admin access

Create an account. It asks for the password (at least 12 characters) with echo off, so the
password never lands in shell history or `ps`:

```bash
cd api && make seed-admin email=owner@example.mn
```

To script it, pipe the password in with no trailing newline:

```bash
printf '%s' "$PASSWORD" | go run ./cmd seed-admin owner@example.mn
```

A second seed of the same email fails. There is no change-password command: to rotate a password,
seed a new account and delete the old one.

### Endpoints

```
POST /api/auth/login    {"email": "...", "password": "..."}   -> access_token, and a refresh cookie
POST /api/auth/refresh  refresh cookie + X-Requested-With     -> a new access_token and cookie
POST /api/auth/logout   refresh cookie + X-Requested-With     -> 200, and the session is revoked
GET  /api/admin/leads   Authorization: Bearer <access_token>
```

- **Refresh and logout need an `X-Requested-With` header** (any value), or they answer 403. A
  plain cross-site form can't set it, so another site can't sign you out.
- The refresh token is only ever a cookie:
  `landing_refresh=...; Path=/api/auth; HttpOnly; Secure; SameSite=Strict`. `Secure` is dropped
  when `APP_ENV=development`.
- Browser clients send `credentials: 'include'` on the `/api/auth` calls and keep the access token
  in memory, not `localStorage`. A client on another origin must be in `CORS_ORIGINS`, or the
  browser drops the cookie. From the command line, use a cookie jar: `curl -c jar -b jar`.
- Access and refresh tokens are not interchangeable.
- `GET /api/admin/leads` takes `limit` (default 50, max 200) and `offset`. It returns
  `{"items": [...], "total": N}`, where `total` counts every lead and `items` is never `null`.
- All `/api/admin` responses, errors included, carry `Cache-Control: no-store`.

### Sessions

| Setting | Default | Meaning |
|---|---|---|
| `JWT_ACCESS_EXPIRE_MINUTES` | 15 | How long an access token works |
| `JWT_REFRESH_EXPIRE_DAYS` | 7 | How long a session may sit unused |
| `JWT_SESSION_MAX_DAYS` | 30 | The longest a login lasts, however active |

`JWT_SECRET` must be at least 32 characters outside development:
`openssl rand -base64 32`.

Each refresh token works once, and the refresh sets a new cookie. Sending a spent token again
looks like theft, so the server revokes the whole login and writes a `token_reuse_detected` row to
`admin_audit_log`. One exception: a token spent in the last 30 seconds whose replacement is still
unused gets the same replacement again. That covers dropped connections and two tabs refreshing at
once. Still, send one refresh at a time from your client.

**Open a `token_reuse_detected` row when you see one.** Compare its `ip` and `user_agent` with the
nearby `login_success` row. A different address or browser means someone else had the token. The
session is already revoked; decide whether to rotate the password.

**Sign out isn't instant for tabs already open.** It revokes the session, so no new token is
issued. But the access token already in a tab keeps working until it expires, up to 15 minutes,
because the API doesn't check a database on every request. On a shared computer, also close the
browser.

### Rate limits

- Per client address: login gets 5 requests per 15 minutes, refresh gets 30. Logout isn't limited.
- Login also backs off per email **and** address together. From the 5th failure, that pair is
  locked for a minute, doubling up to an hour. A success clears it, and so do 30 quiet minutes.
- Because the lock includes the address, a stranger can't lock you out from elsewhere. People who
  share your address (office NAT, a VPN) can.
- Both limits answer 429.

### Behind a proxy or load balancer

Set both `PROXY_HEADER` (e.g. `X-Forwarded-For`) and `TRUSTED_PROXIES` (e.g.
`10.0.0.0/8,172.16.0.0/12`). The header is trusted only from those addresses, and the server takes
the rightmost address that isn't a trusted proxy. If your proxy replaces the header instead of
appending to it, name a header it writes itself, such as `X-Real-IP`.

With `PROXY_HEADER` set and `TRUSTED_PROXIES` empty, the header is ignored and every request shares
the proxy's address, which means one rate-limit bucket for everyone. An entry that won't parse
stops startup.

## Serving the site

`make build` builds the web app, embeds it in the binary, and writes `bin/landing-api`. That one
binary serves the site on `/` and the API on `/api/*`. Without a build embedded (`make run`,
`make dev`), the API still works and there is just no site. `internal/static/dist/.placeholder`
only exists so the package compiles before the first build.

Two security header settings in `internal/http/routes/` matter if you add third-party content:

- In `routes.go`, keep `CrossOriginEmbedderPolicy` and `CrossOriginResourcePolicy` relaxed. The
  strict defaults silently break widgets, CDN assets and iframes.
- In `headers.go`, the content security policy allows only same-origin resources and `data:`
  images. For analytics, a chat widget or CDN fonts, add the host to `script-src`, `img-src` or
  `font-src`, and usually `connect-src` too. Frames need a new `frame-src` line. A missing entry
  shows up only as a CSP error in the browser console.

## Docker

`docker-compose.yml` runs Postgres only. The kit's Dockerfile is built for the kit's own folder
layout, and the scaffolder doesn't generate one for this project yet. Run the database in Docker
and the service directly:

```bash
docker compose up -d db
cd api && make run
```

## Tests

```bash
cd api && go test ./...
```

Integration tests need Docker. With colima instead of Docker Desktop, the tests fail with
"rootless Docker not found" unless you set both of these first:

```bash
export DOCKER_HOST="unix://$HOME/.colima/default/docker.sock"
export TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE=/var/run/docker.sock
```

Set env values in a test with `t.Setenv`. Don't write a second `.env`: the first one read wins for
the whole test binary.
