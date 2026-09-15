# The Go API

`api/` is a GoFiber service on PostgreSQL. It accepts and stores this site's contact form
submissions, with a honeypot and a timing floor as spam defences and an email notification on
every new lead, and it gives an admin a way to read them back: log in, then list leads over
`GET /api/admin/leads`. It is not a CMS — the marketing pages stay static, prerendered at build
time, and this service never touches them.

## Running it

```bash
docker compose up -d db     # Postgres, on host port 5433
cd api && make dev          # air, on PORT (default 3000)
```

Migrations run automatically at startup. Copy `api/.env.example` to `api/.env` before your first
run.

The host port is 5433 rather than 5432 so the compose service does not collide with a Postgres
already running on your machine — see the comment in `docker-compose.yml`. `DB_PORT` in `.env`
defaults to 5433 to match. If you change `DB_USER`, `DB_PASSWORD` or `DB_NAME`, change
`docker-compose.yml`'s `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB` together with them —
a mismatch fails loudly with an authentication error, except for `DB_NAME`: if your own Postgres
happens to hold a database of the same name, a mismatch connects successfully to the wrong one.

## Connecting the contact form

The frontend already POSTs to `VITE_CONTACT_ENDPOINT` — see `src/integrations/submit.endpoint.ts`.
Point it at this service, for example in a `.env` at the project root:

```
VITE_CONTACT_ENDPOINT=http://localhost:3000/api/leads
```

`api/.env.example`'s `CORS_ORIGINS` already defaults to `http://localhost:5173`, Vite's own
default port, so the two dev servers talk to each other with no CORS changes on a fresh scaffold.

## Prerequisites

`sqlc` and `golangci-lint`, both used by `pnpm verify`. `sqlc` is needed to run verify, not only to
regenerate: `pnpm api:sqlc` runs `sqlc diff`, which fails if the committed generated code under
`internal/db/sqlc/` (committed, never hand-edit it) does not match what generation would produce —
catching a hand-edit and a forgotten regeneration alike. It needs no database, because it reads the
migration files as its schema. `air` is optional, for hot reload.

## Notifications

`NOTIFY_DRIVER` selects how a new lead reaches you: `log` (default) writes a line and needs no AWS
account; `ses` sends mail through AWS SES and additionally requires `NOTIFY_TO` and `SES_FROM`.
Startup refuses `NOTIFY_DRIVER=log` when `APP_ENV=production`, because that combination stores
every lead and tells nobody.

## Admin access

Create an admin account, then log in:

```bash
cd api && make seed-admin email=owner@example.mn password=at-least-12-characters
```

`seed-admin` refuses a password under 12 characters and prints nothing but the created email —
never the password, never its hash. A second seed of the same email fails rather than creating a
duplicate.

```
POST /api/auth/login    {"email": "...", "password": "..."}  -> access_token, and a refresh cookie
POST /api/auth/refresh  sends the refresh cookie             -> a fresh access_token, and a new cookie
POST /api/auth/logout   sends the refresh cookie             -> 200, and the session is revoked
GET  /api/admin/leads   Authorization: Bearer <access_token>
```

The refresh token is never in a response body. It leaves as a cookie:

```
Set-Cookie: landing_refresh=...; Path=/api/auth; HttpOnly; Secure; SameSite=Strict
```

`HttpOnly` is why: no script can read the cookie, so an injected one cannot lift a credential that
lasts `JWT_REFRESH_EXPIRE_DAYS`. `Path=/api/auth` keeps it off every `/api/admin/*` request, where
it has no job and could only be logged by a proxy or read out of an access log. `SameSite=Strict`
is also what replaces CSRF tokens here: a request from another site does not carry the cookie at
all. `Secure` is dropped only when `APP_ENV=development`, where the dev server speaks plain HTTP
and the browser would refuse to store a Secure cookie.

So a browser client does nothing to hold the refresh token, and must send `credentials: 'include'`
on the three `/api/auth` calls so the browser attaches it. Keep the access token in memory, not in
`localStorage`. A command-line client needs a cookie jar: `curl -c jar -b jar`.

`access_token` and the refresh token are not interchangeable: `GET /api/admin/leads` rejects a
refresh token, and `POST /api/auth/refresh` rejects an access token. Use the access token
everywhere else, and call `/api/auth/refresh` once it expires (`JWT_ACCESS_EXPIRE_MINUTES`,
default 15 minutes; the refresh token lasts `JWT_REFRESH_EXPIRE_DAYS`, default 7 days).

Each refresh token works exactly once. `/api/auth/refresh` sets a replacement cookie along with the
new access token, and the one you sent is dead from that moment. A browser replaces it for you.

`POST /api/auth/logout` revokes every token descended from that login and expires the cookie. It
answers 200 whether or not a cookie arrived and whether or not it was valid: telling "that was a
real session" apart from "that was nothing" would answer a question the caller never authenticated
to ask. It takes no access token, so it still works after the access token has expired, which is
exactly when someone reaches for Sign out.

Sending a refresh token that was already spent is treated as theft, because two parties holding the
same token is what that looks like from here. The server revokes every token descended from the
same login, including the replacement the honest client is holding, and writes a
`token_reuse_detected` row to `admin_audit_log`. Both parties get a 401 on their next refresh and
have to log in again. A client that keeps a copy of an old refresh token and retries with it will
log itself out this way. A browser cannot: the `Set-Cookie` overwrites the old value and there is
nowhere for a copy to survive. A command-line client using one jar per session gets the same.

The same applies to two refreshes fired at once with the same token: exactly one wins and the other
gets a 401 that takes the session with it. From the server there is no difference between that and a
thief racing the real client. If several requests can discover an expired access token at the same
time, funnel them through one refresh and let the rest wait for its result.

`JWT_SECRET` has no default outside development: startup refuses to run with `APP_ENV` set to
anything but `development` when the secret is empty or shorter than 32 characters, because a short
or empty secret makes admin tokens forgeable. Generate a real one before deploying, for example
`openssl rand -base64 32`.

`POST /api/auth/login` and `POST /api/auth/refresh` are rate limited, same as the contact form, so
repeated wrong guesses get throttled rather than retried without limit. `POST /api/auth/logout` is
not: it is nothing to guess at, and throttling it would leave someone stuck in a session they are
trying to end.

`GET /api/admin/leads` accepts `limit` and `offset` query parameters. `limit` defaults to 50 and is
capped at 200 regardless of what is requested, so one request can't pull every lead the site has
ever received.

## Serving the site

This service can serve the built site itself, alongside the API, out of one binary: `api/internal/static`
embeds the web app's build output with `//go:embed`, and `/` falls back to it for anything that is
not `/api/*`. `make build` (not `make dev`) is what fills it in — it builds the frontend first, then
wipes and recreates `internal/static/dist` from that output rather than copying over the top, so a
stale asset a previous build produced and this one no longer does can never stay embedded forever
(every filename the build produces is content-hashed, so nothing would ever overwrite it). Run
`./bin/landing-api` afterwards and it serves both the site and the API on the same port.

Without a build ever embedded (`make dev`, or `make build` never having run), the service still
starts and the API still works — it just has no site to fall back to, and says so once at startup.
`api/internal/static/dist/.placeholder` is a committed empty file that exists only so this package
compiles on a fresh clone before any build has run; it is not itself a site.

If you serve the site this way, do not put `helmet`'s `CrossOriginEmbedderPolicy` and
`CrossOriginResourcePolicy` back to their library defaults (`require-corp` and `same-origin`) in
`internal/http/routes/routes.go`. Both are relaxed to the browser's own defaults (`unsafe-none` and
`cross-origin`) because the stricter ones silently break every cross-origin subresource the site
loads — third-party widgets, CDN assets, embedded iframes — with no error anywhere on the server
side; the site just looks broken in the browser for no visible reason.

## Docker

```bash
docker compose up --build     # both services; PORT=3001 if 3000 is already taken on your machine
```

Builds and runs the whole thing in one container: `docker build .` produces an image that serves
the site on `/` and the API on `/api/*`, the same way `make build` plus running the binary does
locally. Inside that one container the site and the API share an origin, so `CORS_ORIGINS` matters
far less than it does in local development, where the Vite dev server and this API are two
different origins — a request from the served site to its own `/api/leads` never goes through CORS
at all.

## Tests

```bash
cd api && go test ./...
```

Integration tests need Docker. Set environment values for a test with `t.Setenv`, never by writing
a second `.env` — the first `.env` read wins for the whole test binary and a later one is silently
ignored rather than erroring.

## Why docker-compose.yml has no `api` service

The kit this project was generated from builds one image serving both the site and the API, from a
Dockerfile at its own repo root. That Dockerfile is written for the kit's layout, `apps/web` beside
`apps/api`. This project has a different shape: the web app is flat at the root and the service is
in `api/`. So the kit's Dockerfile does not apply, and the scaffolder does not yet generate one for
this shape.

Shipping a compose file that referenced a Dockerfile this project never received would look
complete and then fail on `docker compose up` with a missing-file error, so the service is omitted
until there is one to point at.

Run the database in compose and the service directly:

```bash
docker compose up -d db
cd api && make dev
```
