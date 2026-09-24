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

`CORS_ORIGINS` also governs whatever admin client reads this API. For a project generated with
`--backend=api` that client is one you write, most likely on an origin of its own, so list that
origin here or its login fails at preflight.

The admin panel a `--backend=admin` project receives is the exception, and it is worth knowing why
before adding an origin to fix a problem it does not have. That panel calls the API with relative
paths, which Vite's `/api` proxy forwards in development and the one binary answers directly in
production, so it is same-origin at both ends and nothing it sends is preflighted. Moving it to an
origin of its own is not an env-var change either: every fetch it makes hard-codes
`credentials: 'same-origin'`, so it would send no refresh cookie whatever this list allows.

**Every entry in `CORS_ORIGINS` must be a literal origin. Any `*` is refused at startup**, and that
includes Fiber's `https://*.example.com` subdomain form, which this service used to accept. If you
have one, the service will not start until you replace it with the origins you actually mean.

The reason is the same for both spellings. The admin session cookie only crosses origins because
the API answers with `Access-Control-Allow-Credentials: true`, which also lets the caller *read* the
reply. A bare `*` would hand a logged-in admin session to any site a browser visits. A subdomain
wildcard is narrower and still enough: any host matching the pattern can call `/api/auth/refresh`
with the admin's cookie attached and read the fresh access token out of the response. One forgotten
subdomain, or one subdomain someone else takes over, is the whole panel. List the origins.

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
cd api && make seed-admin email=owner@example.mn
```

It prompts for the password with the terminal's echo turned off. **The password is never an
argument**, so it stays out of your shell history, out of the scrollback, and out of the process
table, where any other user on the machine could have read it with `ps`. To script it, pipe the
password in with no trailing newline and pass only the email:

```bash
printf '%s' "$PASSWORD" | go run ./cmd seed-admin owner@example.mn
```

`seed-admin` refuses a password under 12 **characters** — characters, not bytes, so six Cyrillic
letters do not pass — and prints nothing but the created email, never the password and never its
hash. A second seed of the same email fails rather than creating a duplicate.

```
POST /api/auth/login    {"email": "...", "password": "..."}   -> access_token, and a refresh cookie
POST /api/auth/refresh  refresh cookie + X-Requested-With     -> a fresh access_token, a new cookie
POST /api/auth/logout   refresh cookie + X-Requested-With     -> 200, and the session is revoked
GET  /api/admin/leads   Authorization: Bearer <access_token>
```

**Refresh and logout require an `X-Requested-With` header.** Any value; only its presence is
checked. Without it both answer 403, so a client that does not send it cannot renew a session or
sign out. `Accept` does not satisfy this and cannot: it is a header a cross-site form is allowed to
set, and the point is to require one that is not. The paragraph on `SameSite` below explains what
that buys.

The refresh token is never in a response body. It leaves as a cookie:

```
Set-Cookie: landing_refresh=...; Path=/api/auth; HttpOnly; Secure; SameSite=Strict
```

`HttpOnly` is why: no script can read the cookie, so an injected one cannot lift a credential that
lasts `JWT_REFRESH_EXPIRE_DAYS`. `Path=/api/auth` keeps it off every `/api/admin/*` request, where
it has no job and could only be logged by a proxy or read out of an access log. `SameSite=Strict`
is most of what replaces CSRF tokens here: a request from another site does not carry the cookie at
all. `Secure` is dropped only when `APP_ENV=development`, where the dev server speaks plain HTTP
and the browser would refuse to store a Secure cookie.

`X-Requested-With` is the rest of it. `SameSite` is evaluated per *site*, not per origin, so a page
on a sibling subdomain — a blog on `blog.example.com`, say — is the same site as your panel and its
requests do carry the cookie. Refresh and logout take no body and no custom header, which made them
the kind of request a browser sends with no preflight, so such a page could sign your admin out
whenever it liked and rotate the refresh cookie underneath a live tab. It could never read either
answer, so nothing leaked. Requiring a header a plain form cannot set means a cross-origin caller
has to pass a preflight that `CORS_ORIGINS` governs first.

So a browser client does nothing to hold the refresh token, and must send `credentials: 'include'`
on the three `/api/auth` calls so the browser attaches it. Keep the access token in memory, not in
`localStorage`. A command-line client needs a cookie jar: `curl -c jar -b jar`.

`credentials: 'include'` is only half of it. The browser also drops the cookie unless the response
carries `Access-Control-Allow-Credentials: true`, which the API sends only for an origin listed in
`CORS_ORIGINS`. A panel served from an origin that is not on that list logs in, receives the
`Set-Cookie`, throws it away, and then fails every refresh with no error that says why.

`access_token` and the refresh token are not interchangeable: `GET /api/admin/leads` rejects a
refresh token, and `POST /api/auth/refresh` rejects an access token. Use the access token
everywhere else, and call `/api/auth/refresh` once it expires (`JWT_ACCESS_EXPIRE_MINUTES`,
default 15 minutes; the refresh token lasts `JWT_REFRESH_EXPIRE_DAYS`, default 7 days).

Two settings bound a session, not one, and reading only the first will tell you a week is the
maximum. `JWT_REFRESH_EXPIRE_DAYS` is an **idle** timeout: it is how long one refresh token may sit
unused, and every refresh issues a new one with a fresh seven days on it. `JWT_SESSION_MAX_DAYS`,
default 30, is the **absolute** ceiling on the whole login. It is stamped once when you sign in,
carried forward unchanged by every refresh, and no token can be issued past it. A session ends at
whichever comes first, so signing in again is the only way to get a later deadline. Without the
ceiling, anyone who kept refreshing kept the session alive forever — which is as true of a stolen
cookie being rotated quietly as it is of you.

Each refresh token works exactly once. `/api/auth/refresh` sets a replacement cookie along with the
new access token, and the one you sent is dead from that moment. A browser replaces it for you.

`POST /api/auth/logout` revokes every token descended from that login and expires the cookie. It
answers 200 whether or not a cookie arrived and whether or not it was valid: telling "that was a
real session" apart from "that was nothing" would answer a question the caller never authenticated
to ask. It takes no access token, so it still works after the access token has expired, which is
exactly when someone reaches for Sign out.

**Signing out is not instantaneous, and it matters on a shared machine.** What is immediate is that
the login's whole token family is dead, so nothing new is ever issued: the next refresh fails and
there is no way back in without the password. What is not immediate is the access token already in
that tab's memory. `/api/admin/leads` checks the token's signature and expiry and looks nothing up,
so a token minted just before the logout keeps reading leads until its own clock runs out — up to
`JWT_ACCESS_EXPIRE_MINUTES`, fifteen minutes by default. That is the deliberate price of not making
a database read on every admin request. On a borrowed machine, close the browser, and if the tab
itself was left with someone you do not trust, treat those fifteen minutes as exposure.

Sending a refresh token that was already spent is treated as theft, because two parties holding the
same token is what that looks like from here. The server revokes every token descended from the
same login, including the replacement the honest client is holding, and writes a
`token_reuse_detected` row to `admin_audit_log`. Both parties get a 401 on their next refresh and
have to log in again. A client that keeps a copy of an old refresh token and retries with it will
log itself out this way. A browser cannot: the `Set-Cookie` overwrites the old value and there is
nowhere for a copy to survive. A command-line client using one jar per session gets the same.

One case is forgiven, because it happens to honest clients with no attacker anywhere. A token spent
within the last 30 seconds whose replacement is still live is treated as a rotation whose response
went missing, not as theft: you get the same replacement re-sent, with no revocation and no audit
row. That covers a tab closed mid-refresh, a dropped connection, a proxy timeout, and two tabs
restored together that both send the same cookie before either reply lands. Past 30 seconds, or if
the replacement has itself been spent, it is theft again.

That forgiveness is a window, not a licence. If several requests in your client can discover an
expired access token at once, still funnel them through one refresh and let the rest wait for its
result — it is one round trip cheaper, and it keeps the audit signal clean.

**A `token_reuse_detected` row is worth opening, not scrolling past.** It is the only signal this
service can raise that a refresh token was used from somewhere it was not issued to. Nothing else in
the log separates a stolen session from a real one, because a stolen token is a valid token. The row
carries `ip` and `user_agent`; compare them with the `login_success` row for the same `admin_id`
nearby. The benign causes above all look like the same client twice, so a different address or a
different browser is the case to take seriously. The family is already revoked by the time you read
the row, which is the containment. What is left to decide is whether the password went with it.
There is no change-password command. `seed-admin` is the only account tool and it refuses an email
that already exists, so rotating a password means seeding a second account and deleting the first,
which cascades away its refresh tokens and leaves its audit rows with a null `admin_id`.

`JWT_SECRET` has no default outside development: startup refuses to run with `APP_ENV` set to
anything but `development` when the secret is empty or shorter than 32 characters, because a short
or empty secret makes admin tokens forgeable. Generate a real one before deploying, for example
`openssl rand -base64 32`.

`POST /api/auth/login` and `POST /api/auth/refresh` are rate limited per client, so repeated wrong
guesses get throttled rather than retried without limit. The two allowances differ: login gets five
requests per fifteen minutes, refresh gets thirty in the same window. Refresh is looser on purpose,
because a refresh presented without a valid cookie grants nothing, so there is no secret to guess
there — and a panel that keeps its access token in memory refreshes once per tab and once per
reload, which a five-request budget turned into a trip back to the login form after an ordinary
morning's work.

Login also backs off per email, which the per-client limit alone cannot do: that limit counts
requests and does not care what they are for, so from the fifth failed login the email is refused
for a minute, doubling with each further failure up to fifteen. It is a bound rather than a wall:
guesses already in flight when the lock lands still get an answer, so a burst of twenty costs twenty
guesses before it goes quiet for the window. Both limits answer with the same 429.
`POST /api/auth/logout` is not limited: it is nothing to guess at, and throttling it would leave
someone stuck in a session they are trying to end.

That counter belongs to an email and a client address together, not to the email on its own. A lock
covering the whole account would be a denial of service against anyone whose address is known:
telling the real admin from a stranger means checking the password, and refusing to check it is what
the lock is, so one failed login every quarter hour would keep the admin off the panel indefinitely.
Keyed per source, a stranger hammering your address locks out their own machine and you sign in
normally from anywhere else. What that gives up is a backoff spanning many source addresses. An
attacker spread across a thousand of them pays it a thousand times over rather than once, and that
is the same property as the denial of service, so it could not be kept. The per-client limit still
covers each of those addresses.

One case remains: someone sharing a source address with you, on office NAT or a shared VPN, or
behind a proxy where `PROXY_HEADER` is set and `TRUSTED_PROXIES` is not, which makes every request
look like it came from the proxy. They can still lock that address out.

A successful login clears the counter for the address it came from, so the doubling starts from
nothing next time. So does ten minutes of quiet: a failure older than that no longer counts towards
the curve, and the next one starts the count again at one. Ten is shorter than the fifteen-minute
cap on purpose, which is what lets a source that served a full-length lock climb back down instead
of re-locking forever. An admin who mistyped their password five times should wait out the window
and log in again rather than go editing `login_attempts` by hand. The row clears itself the moment
they get in.

**Set `TRUSTED_PROXIES` if you deploy behind a load balancer**, together with `PROXY_HEADER`. Every
limit above is keyed on the client address, and `PROXY_HEADER` alone used to mean the service
believed whatever the caller wrote in that header: a fresh value per request is a fresh bucket per
request, which is no limit at all, and the same value lands in `admin_audit_log.ip`.
`TRUSTED_PROXIES` is a comma-separated list of IPs or CIDR ranges — `10.0.0.0/8,172.16.0.0/12` —
and the header is read only when the connection actually came from one of them. Leaving it empty
while `PROXY_HEADER` is set means the header is ignored entirely and every request behind the proxy
shares one bucket, which is a real cost and still the safer default. An entry that will not parse
stops startup rather than being silently dropped.

`GET /api/admin/leads` accepts `limit` and `offset` query parameters. `limit` defaults to 50 and is
capped at 200 regardless of what is requested, so one request can't pull every lead the site has
ever received. It answers with an object, `{"items": [...], "total": N}`, rather than a bare array.
`total` is the size of the whole table, not of the page, so a client can show a range or a page
count instead of only a Next button. `items` is always an array and never `null`. An empty inbox is
the likeliest state on a fresh deploy, and a client that maps over the list should not need a guard
for it.

`Cache-Control: no-store` is set on the whole `/api/admin` group, ahead of the token check, so the
401 from a missing or invalid token carries it as well as the 200s do. These responses hold names,
emails, message bodies, IP addresses and user agents, and a shared proxy or a browser's
back-forward cache keeping a copy of that is a leak nobody would notice until it mattered. Setting
it on the group rather than per handler is what stops a route added later from forgetting it.

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

The content security policy is strict for an unrelated reason, and it is the other half of the
same story. `contentSecurityPolicy` in `internal/http/routes/headers.go` allows same-origin
subresources, plus `data:` images, and nothing else. That is correct for the site as generated,
where every script, style, image and font is served from this binary.

Add a third-party script (analytics, a chat widget) or an image or font from a CDN, and you have
to name that host in the matching directive: `script-src`, `img-src` or `font-src`. Nearly all of
them also need `connect-src`, which is the one that catches people out. An analytics snippet loads
its script from one host and then beacons events back to another, so allowing `script-src` alone
gets it running and still drops every event it sends. Embed a frame and you add a `frame-src`
line, because there is none today and frames fall through to `default-src 'self'`.

Skip any of that and the failure looks exactly like the one above — the browser blocks the
resource, the server logs nothing because it never saw the request, and the only evidence is a CSP
violation in the browser console.

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
