# Maintaining Landing Kit

Notes for working on the kit itself. **None of this reaches a generated project**, and this file
is deliberately absent from `package.json`'s `files`, so it never ships to npm either — a person
installing the kit is building a landing page, not maintaining a generator.

If you are building a site, everything you need is in [README.md](./README.md).

## Contents

- [Repo layout](#repo-layout)
- [Scaffold snapshots](#scaffold-snapshots)
- [Maintainer commands](#maintainer-commands)
- [The three env flags](#the-three-env-flags)
- [Swapping the whole config: `configs/`](#swapping-the-whole-config-configs)
- [Lighthouse budget](#lighthouse-budget)
- [Publishing](#publishing)
- [What ships and what does not](#what-ships-and-what-does-not)

## Repo layout

The kit is a pnpm workspace, with `apps/web/` and `apps/api/` as its two packages.

| Path | What it is |
|---|---|
| `apps/web/` | The web template. This is what a scaffolded project's frontend becomes. |
| `apps/api/` | The Go service. Copied into a scaffold only when a backend is requested. |
| `cli/` | The scaffolder. Never copied into a generated project. |
| `tools/` | Maintainer commands: smoke builds, Lighthouse, scaffold snapshots. Not published. |

The Lighthouse configs live in `apps/web/`, beside the app they measure. `tools/kit.mjs` runs
every command with `apps/web` as its working directory, which is what makes their relative paths
resolve.

Paths in `cli/kit-manifest.mjs` are relative to **two** places at once: `apps/web/` in this repo,
and the ROOT of a generated project. `WEB_ROOT` in that file is what reconciles them, and
`kitPath()` is the only way kit files should be read. `ROOT_SOURCED` lists anything that should be
read from the kit root instead of `WEB_ROOT`; it is empty today, kept as the seam for the next kit
file that genuinely belongs at the root and still needs to land in a generated project's root too.
A generated project is flat and stays flat.

`apps/api/` gets the same two-constant treatment, in the same file: `API_ROOT` (`apps/api`, where
the service lives in this repo) and `API_DEST` (`api`, where it lands in a scaffold), reconciled by
`apiPath()`. Two constants for the same reason as `WEB_ROOT`: the kit is a pnpm workspace, so its
own packages sit under `apps/`, but a generated project is not a workspace at all — it is one flat
app with the service beside it. That flatness is deliberate, not a simplification still to be
undone: it is what lets `cli/add.mjs` stay unaware a backend exists, so `add-block` and `add-page`
need no branch for "does this project have `apps/api`?" A generated project with a backend is
`web-stuff/` plus `api/`, never `apps/web/` plus `apps/api/`.

There are two READMEs and they are not copies. `apps/web/README.md` documents a generated site and
is the file the scaffolder copies into one. The root `README.md` documents this repository and is
what npm and GitHub display. The template's README used to be `ROOT_SOURCED` itself, kept at the
kit root so npm's package page would show it there, and that split it from the tree it describes:
`apps/web/scripts/check-conventions.mjs` cross-checks the README against the source tree and
resolves every path, README included, against its own working directory, so it could no longer see
the README sitting one level above. The template's README lives with the template now, and the kit
root has its own, written for this repository rather than for a generated one.

`apps/web/package.json`'s version is deliberately `0.0.0` while the root's is the real published
version. `kitManifest` reads the version from the root `package.json` and the dependency ranges
from `apps/web/package.json`; holding both at the same string would make swapping those two reads
invisible to every check in this repo. Leave the mismatch alone.

## Scaffold snapshots

`tools/scaffold-snapshot.mjs` hashes the full output of six answer combinations and compares
against `tools/__snapshots__/`. `pnpm verify` runs it.

A failing snapshot means generated projects changed. That is often intended: re-record with
`node tools/scaffold-snapshot.mjs record <variant>`, then **read the diff** before committing it.
The snapshot's value is entirely in that read; re-recording without looking makes it decoration.

Name the variant. A bare `record` re-records all six, and the five non-admin profiles are what
prove the admin panel reaches no project that declined it, so a bare `record` after an admin-side
change would bless a leak instead of catching it. Run `check` first, record the one profile you
meant to move, then `check` again.

The `.kit/scaffold.json` entry contains the kit version, so a version bump changes one hash in
every variant. That is expected, and it is also the check that the version reached the file.

## Maintainer commands

`tools/kit.mjs` holds the commands that only make sense in this repository:

```bash
node tools/kit.mjs smoke:full         # default config, animated, server submit
node tools/kit.mjs smoke:onepage      # one-page config, no animation, endpoint submit
node tools/kit.mjs lighthouse         # mobile budget
node tools/kit.mjs lighthouse:desktop # desktop budget
```

They live here rather than in `package.json` `scripts` because `scripts` ships inside the published
tarball. Four commands pointing at `configs/` and `lighthouserc*` — neither of which is in
`files` — would appear in every consumer's `package.json` and none of them could run.

## The three env flags

Set at build or dev time. Each swaps an import alias in `vite.config.ts` — never an `if` inside a
component. A generated project gets a static `vite.config.ts` with the choice already baked in, so
these exist only here.

| Flag | Values | Effect |
|---|---|---|
| `KIT_ANIMATION` | `on` (default), `off` | `off` swaps `@/motion` to passthrough components, and the `motion` library leaves the bundle entirely. |
| `KIT_SUBMIT` | `endpoint` (default), `server` | `endpoint` POSTs to `VITE_CONTACT_ENDPOINT`. `server` uses a TanStack Start server function. Both validate with the same schema. |
| `KIT_CONFIG` | `default` (default), `onepage` | Selects which config directory the app and the build driver both read. |

`site.theme.mode` in `site.config.ts` works the same way: `'both'` ships the toggle and the
no-flash script, anything else ships no theme-switching code at all.

## Swapping the whole config: `configs/`

`apps/web/configs/smoke-onepage/` is a complete second config — one page holding every block, light
only. It exists to prove the premise end to end: it contains **no components and no overrides**,
and needs zero edits under `apps/web/src/`.

```bash
node tools/kit.mjs smoke:onepage
```

produces a working single-page, light-only, unanimated site — where the hero's CTA resolves to
`#contact` (an anchor) instead of `/contact` (a page), from the same components and the same copy.

If you add another config, remember that **`vite.config.ts` must branch on `KIT_CONFIG` too**. The
alias only affects app code Vite bundles; the config file reads its own `pages`/`site` directly to
drive prerendering.

## Lighthouse budget

`apps/web/lighthouserc.json` (mobile) and `apps/web/lighthouserc.desktop.json` (desktop) assert on
all four prerendered pages of the default build.

```bash
node tools/kit.mjs lighthouse
node tools/kit.mjs lighthouse:desktop
```

## Publishing

Published to npm as `@tanasoftllc/landing-kit`. The scope carries the `llc` because npm holds
`tanasoft` from an organization that was created and deleted, and a name in that state can only be
released by npm support.

Versions 0.1.0 through 0.3.1 shipped as `@dewsoft/landing-kit`. Once the first `@tanasoftllc`
release is up, point the old name at it:

```bash
npm deprecate @dewsoft/landing-kit "moved to @tanasoftllc/landing-kit"
```

That marks every published version without removing any of them, so the old name stays installable
forever. Which is why one reference to it survives on purpose: the error in `cli/add.mjs` that sends a pre-0.3 scaffold to
`pnpm dlx @dewsoft/landing-kit@0.2.0`. That version exists under no other name, and pointing it
anywhere else would hand the reader a 404.

Releases come from CI, not from a laptop:
`.github/workflows/release.yml` publishes on a push to `main` whenever the version in
`package.json` is not already on the registry. So a release is one edit:

```bash
npm version patch --no-git-tag-version   # or minor / major
git commit -am "release 0.3.3" && git push
```

A merge that does not touch the version runs the checks and publishes nothing.

The workflow authenticates with [trusted publishing](https://docs.npmjs.com/trusted-publishers/):
GitHub Actions mints a short-lived OIDC token scoped to one run, which is why the `publish` job
carries `id-token: write` and why no npm token is stored in the repo. 2FA is on for writes, and
trusted publishing satisfies that requirement rather than working around it. Configuring it is a
one-time step in the package settings on npmjs.com, naming the org, the repo, and the workflow
filename. **Renaming `release.yml` breaks publishing** until that config is updated to match.

Because that configuration lives in a package's settings, a package npm has never seen cannot have
one. So the first release under a new name is published by hand, and CI takes over from the second.
That is a bootstrap step, not the normal flow.

Three pins in the workflow have to track the repo. `SQLC_VERSION` matches the version stamped in
the header of `apps/api/internal/db/sqlc/*.go`, because `sqlc diff` compares byte for byte and a
newer sqlc fails on regenerated formatting alone. `packageManager` in `package.json` is what
`pnpm/action-setup` reads, so CI and your shell cannot drift. The Go version comes from
`apps/api/go.mod` and needs no separate pin.

Publishing by hand works the same way locally, where `npm publish` prompts for a one-time code.

The `smoke` job is the part worth understanding. It packs the real tarball, scaffolds from it, and
runs `verify` on the result:

```bash
npm pack --pack-destination /tmp
cd /tmp && tar xzf tanasoftllc-landing-kit-*.tgz
node package/cli/index.mjs /tmp/smoke-scaffold --yes
```

Then install and `verify` that scaffold. This catches a missing entry in `files`, which no other
check can see. A fresh scaffold fails its own `verify` until `url` in `src/config/site.config.ts`
is set, so CI substitutes a dummy domain first.

## What ships and what does not

`files` in `package.json` is an allowlist: anything not named there never reaches the tarball.
That is the whole mechanism keeping the following out of a published install, with no build step
and no publish-time rewriting of `package.json`:

| Not shipped | Why |
|---|---|
| `tools/` | Maintainer commands — see above |
| `apps/web/configs/` | The second config exists to test the kit, not to ship |
| `apps/web/lighthouserc*.json` | Performance budgets for this repo's own build |
| `MAINTAINERS.md` | This file |

The README is trimmed on the way out too. `cli/copy.mjs` drops the sections a generated project
should not claim to have, and the generated project's own `pnpm conventions` fails on a dangling
table-of-contents entry — so a partial removal breaks loudly instead of shipping a dead anchor.

`files` lists paths under `apps/web/` individually rather than shipping `apps/web` wholesale, which
is the only reason `configs/` and `lighthouserc*.json` stay out of a consumer's install despite
living right beside the code that does ship. `apps/web/package.json` has to be one of those
individually listed paths: `generate.mjs` reads it at scaffold time, through `kitPath()` rather than
through anything `files` mentions by name, to get the dependency ranges for the site it writes.
Drop that one line from `files` and the published package still builds, still passes every check in
this repo, and still installs; it just cannot scaffold a project, because the one file the CLI
needs at scaffold time never made it into the tarball. Nothing but a real `npm pack`, a real
install, and a real scaffold (see Publishing, above) would catch that.

`apps/api` ships as one whole-directory entry, unlike `apps/web`'s per-directory listing above.
There is nothing under `apps/api` that must stay out of a consumer's install — no second config, no
Lighthouse budget — so there is no reason to enumerate its contents one by one, and no drift for a
new file under `apps/api` to fall through: it is in `files` automatically, where a new top-level
directory under `apps/web` would not be. This exact class of bug — a file the CLI needs at scaffold
time missing from `files` — is what shipped once already, which is why `apps/api`'s entry is the
whole tree rather than a second hand-maintained list to keep in sync with `API_COPY_DIRS` and
`API_COPY_FILES` in `cli/kit-manifest.mjs`.

## The Go API

`apps/api` is a GoFiber service on PostgreSQL, laid out like `psyfint_v2_back` and `habido-back`:
`cmd/` for the entry point, `conf/` for typed config, and `internal/{http,service,db,utils}`.

### Running it

```bash
docker compose up -d db     # Postgres, on host port 5433
cd apps/api && make dev     # air, on PORT (default 3000)
```

Migrations run at startup, as in `habido-back`. The host port is 5433 rather than 5432 so the
compose service does not collide with a Postgres already running on the developer's machine; see the
comment in `docker-compose.yml`. `DB_PORT` defaults to 5433 to match, and `apps/api/conf/config.go`
holds that number in one named constant so the code default and compose cannot drift.

`DB_USER`, `DB_PASSWORD` and `DB_NAME`'s defaults mirror `docker-compose.yml`'s `POSTGRES_USER`,
`POSTGRES_PASSWORD` and `POSTGRES_DB`, and must be changed together. That is a documented coupling
rather than a shared constant on purpose: the duplication is between Go and YAML, so a Go constant
would look like a fix without being one. `DB_PORT` was different and did get a constant, because
that value is also compared inside Go.

A mismatch in the user or password fails loudly with an authentication error. `DB_NAME` is the one
worth care: if a developer's own Postgres happens to hold a database of the same name, a mismatch
connects successfully to the wrong one.

### Prerequisites

`sqlc` and `golangci-lint`, both used by `pnpm verify`. `sqlc` is needed to RUN verify, not only to
regenerate, because `pnpm api:sqlc` runs `sqlc diff`. `air` is optional, for hot reload.

Generated SQLC code under `internal/db/sqlc/` is committed, so a first run needs no codegen. Run
`make sqlc` only after editing a query or a migration. Never hand-edit the generated files:
`pnpm api:sqlc` fails if the committed output does not match what generation would produce, which
catches both a hand-edit and a forgotten regeneration, and it needs no database because it reads the
migration files as its schema.

### Notifications

`NOTIFY_DRIVER` selects how a new lead reaches the site owner: `log` writes a line, `ses` sends mail
through AWS SES following `habido-back`. It defaults to `log` so `pnpm dev` works with no AWS
account, and `conf.Load` refuses `log` when `APP_ENV=production`, because that combination stores
every lead and tells nobody.

`NOTIFY_DRIVER=ses` additionally requires `NOTIFY_TO` and `SES_FROM`, both checked at the config
boundary. The region is checked differently: `NewSES` errors when the **resolved**
`aws.Config.Region` is empty rather than requiring `AWS_REGION` to be set, so a shared config profile
or an explicit variable both satisfy it. Note EC2 instance metadata does not, deliberately; the
comment in `ses.go` explains why enabling it would make startup hang on non-EC2 hosts.

The asymmetry with the CORS guard is intentional. The development default for `CORS_ORIGINS` is
refused for any environment that is not `development`, because a wrong origin is simply broken
everywhere. `NOTIFY_DRIVER=log` is refused only in `production`, because a staging site emailing a
real client is worse than a staging site not emailing.

`CORS_ORIGINS` carries a second check with no environment condition at all: any entry containing
`*` is refused, in `development` too. `internal/http/routes` sets `AllowCredentials: true` so the
admin refresh cookie survives a cross-origin login, and the CORS spec forbids pairing credentials
with a wildcard origin. Fiber v2.52.8 enforces the bare `"*"` itself, by panicking inside `cors.New`
and panicking on `"Invalid origin format in configuration: *"` when `*` is one entry in a longer
list. Both are fatal, so the config check is not what makes that case safe; what it adds is a
startup error naming `CORS_ORIGINS` and the consequence, instead of a stack trace out of middleware
setup.

**Fiber's `https://*.example.com` subdomain form is now refused too, and that is a breaking change**
for anyone who had one. It used to work, because entries are compared whole and Fiber answers with
the caller's own origin rather than with `*`. What it means with credentials allowed is that every
host matching the pattern can call `/api/auth/refresh` with the admin's cookie attached and *read*
the reply, which carries a fresh access token. One forgotten subdomain, or one subdomain takeover,
is then the whole panel rather than a nuisance. Without `AllowCredentials` such a host could send
the request but not read the answer; with it, the wildcard converts a takeover into a session. List
each origin literally. `admin.example.com` calling `api.example.com` is the deployment shape worth
supporting here — cross-origin but same-*site*, so the `SameSite=Strict` cookie does travel and the
CORS header is doing real work. A panel on a genuinely different registrable domain never receives
that cookie whatever CORS says, so nothing is lost by refusing to guess at hostnames.

`PROXY_HEADER` has a companion, `TRUSTED_PROXIES`, and the pair is what makes either safe.
`fiber.New` used to set `ProxyHeader` without `EnableTrustedProxyCheck`, which defaults to false, so
`IsProxyTrusted()` answered true for every request and `c.IP()` returned whatever the caller wrote
in that header. Every limiter here is keyed on `c.IP()`, so a fresh header value per request meant a
fresh bucket per request and no limit at all, and `admin_audit_log.ip` is a `text` column fed from
the same place, so attacker-chosen text was being persisted into the audit log. Leaving
`PROXY_HEADER` empty is not the fix either: then every caller behind the proxy shares the proxy's
address and one bucket, which is the failure `clientKeyGenerator`'s comment describes
`psyfint_v2_back` hitting. `EnableTrustedProxyCheck` and `EnableIPValidation` are now both on,
with `TrustedProxies` from the new comma-separated `TRUSTED_PROXIES` — IPs or CIDR ranges — so the
header is read only when the socket peer is on the list, and the socket address is used otherwise.
`conf.Load` parses every entry and refuses to start on one it cannot, because Fiber only
`log.Warnf`s an unparseable entry and drops it: a typo'd CIDR would otherwise boot cleanly, quietly
stop trusting the proxy it names, and show up as every caller sharing one bucket and nothing else.

### Admin authentication

`internal/service/auth`, `internal/utils/secure` and `internal/http/handlers/middleware.go` mirror
`psyfint_v2_back`'s login/refresh service and Bearer-token middleware: HS256, one secret, and the
same Mongolian 401 messages. Two deliberate differences, this one and the refresh token ledger
further down. `Login` always runs bcrypt, even when the email does not exist, comparing against a
fixed dummy hash instead of returning early on `pgx.ErrNoRows`. Returning early is faster, and that
speed difference is itself an oracle — bcrypt is deliberately slow, so a request that skips it
answers measurably sooner than one that ran it, letting a caller enumerate registered emails by
timing alone even though both cases return the identical error message.

That only works while the dummy hash carries the same bcrypt cost as a real one, because bcrypt's
running time comes from the cost encoded in the hash it is handed. A dummy left behind at a lower
cost makes the unknown-email path the faster one again, which is what happened when `HashPassword`
moved to cost 12. `internal/service/auth`'s `init` now refuses to start the process if the constant
is below `utils.bcryptCost`, on the same reasoning as `conf.Load` refusing a short `JWT_SECRET`: a
security invariant that is wrong should stop the server, not log a warning nobody reads.

`JWT_SECRET` has no default outside development. `conf.Load` refuses to start when
`APP_ENV` is anything but `development` and the secret is empty or shorter than 32 characters:
HS256 with a short secret is brute-forceable offline once an attacker holds one token to check
guesses against, and an empty secret makes every admin token forgeable by anyone. Development gets
a documented, obviously-a-placeholder default so `pnpm dev` runs with no `.env` at all.

Access and refresh tokens are not interchangeable. `secure.Claims.TokenType` is checked on every
validation, not only at issue time, because a refresh token lives far longer (days, versus
minutes for an access token) — accepting one as the other would silently extend a stolen or
leaked token's usefulness to the longer of the two lifetimes. `ValidateAccessToken` and
`ValidateRefreshToken` each reject the other token type, and the keyfunc in `parseToken` asserts
`*jwt.SigningMethodHMAC` so a token signed with a different algorithm is rejected before its
signature is even checked.

Refresh tokens are not stateless, which is the second deliberate difference from `psyfint_v2_back`.
Every one carries a `jti` and has a row in `refresh_tokens`, so a signature alone no longer buys
entry: `Refresh` looks the row up and refuses a token that has none. Spending a token revokes its
row and writes a replacement under the same `family_id`, so one login produces one chain of tokens
that can be killed together.

That chain also has an end, which it did not used to. `JWT_REFRESH_EXPIRE_DAYS` is an **idle**
timeout and nothing more: every rotation calls `GenerateRefreshToken`, which computed the expiry
from the current time, so anyone who refreshed once a week kept the family alive forever. For an
honest admin that meant never signing in again; for a thief rotating a stolen cookie quietly it
meant permanent access, bounded only by a replay detection that fires only if the real admin happens
to present a spent token — and if the admin stops using the panel, the thief's chain is the only
live one and nothing ever detects anything. `JWT_SESSION_MAX_DAYS`, default 30, is the **absolute**
ceiling. `Login` stamps `now() + sessionMaxDays` into `refresh_tokens.family_expires_at`, every
rotation copies that value forward untouched, and `GenerateRefreshToken` clamps each successor's own
expiry to it. A session ends at whichever bound arrives first. Set them equal to make the idle and
absolute windows the same, which is strictly safer and less comfortable.

`Refresh` checks `family_expires_at` explicitly as well as relying on the clamp, with the same
`errInvalidToken` and the same 401 as any other refusal. The clamp means the row's own `expires_at`
check almost always fires first — almost, because a row written before the clamp existed carries no
such guarantee, and a bound that only holds for rows this version wrote is not a bound.

Presenting an already-revoked token is what replay looks like from the server: two parties hold a
token only one of them came by honestly, and there is no way to tell which one is asking. So the
whole family is revoked, `audit.Record` writes `token_reuse_detected`, and both parties are sent
back to the login screen. That is disruptive on purpose. The alternative is a thief rotating
quietly for the whole session with nothing able to stop them.

One exception, and only one: `resumeLostRotation`. A spent row whose `revoked_at` is inside
`rotationGrace`, thirty seconds, and whose `replaced_by` successor is still live and unexpired is
not a replay — it is a rotation whose response went missing. The server spent the cookie and
committed, then the reply never landed: a tab closed mid-flight, a dropped connection, a proxy
timeout, or a second tab that sent the same cookie before the first `Set-Cookie` arrived. The
browser still holds the old value and presents it next time. That was costing honest admins their
whole family and writing a `token_reuse_detected` row about an attack that never happened, which is
how a real one gets ignored. Inside the window the server re-signs a refresh JWT carrying the same
successor `jti` and mints a fresh access token: no new ledger row, no new `jti`, no revocation, no
audit row. Outside it, nothing changes. A thief replaying within thirty seconds of an honest
rotation escapes detection once and gets a session the honest client also has, which is a far
smaller cost than the old behaviour's.

`replaced_by` is the column that makes it decidable. Without it a spent row says only that it was
spent, and a lost response and a replay are indistinguishable.

Spending a token and issuing its successor are one transaction, taken under an advisory lock on the
`family_id` (`LockTokenFamily`). Neither half of that is decoration. The transaction removes the
in-between state: there is no longer a moment where the old row is dead and the new one is not yet
written, so a crash mid-rotation leaves the presented token still live and the client's next attempt
with it simply works.

The lock is what orders a rotation against a family revoke running at the same time, and row locks
cannot do that job. A row lock orders two writes to one row; the collisions here are a write against
an `INSERT` of a row that does not exist yet, and an `UPDATE`'s scan cannot see a row inserted after
its own statement began. Two orderings run into that. Two requests race on one live token: the loser
matches zero rows and goes on to revoke the family, and without the lock its `UPDATE` can start
before the winner's successor is committed and never see it. Or a replay of a long-spent token
arrives while the honest client is rotating the live one: the family revoke blocks on the live row,
re-evaluates, skips the row the rotation has just revoked, and again misses the successor. Both
leave a live token inside a family the server has just declared compromised — the honest client is
logged out, the thief keeps rotating, and no second token is left in play to trigger detection
again. With every writer taking the lock first, whichever runs second begins after the other has
committed and sees its rows.

Waiting on that lock is bounded, and bounded in the pool rather than at each call site.
`dbsetup.NewPool` sets `lock_timeout` to 3000 ms as a connection runtime parameter, so any statement
that blocks on a lock for three seconds fails instead of waiting forever. The HTTP layer hands the
database a context with no deadline, so without this a request wedged behind a contended row or a
held advisory lock holds a pooled connection indefinitely, and enough of them exhaust the pool while
every log stays quiet. Three seconds is far above any lock this API takes deliberately: reaching it
means something is wrong, and failing loudly is the point.

`issueTokenPair` fails the whole call if the ledger insert fails, rather than returning a signed
token with no row behind it: that token would be rejected on its first use, and the admin would be
bounced with nothing explaining why.

`RevokeRefreshToken` is `:execrows` and its count is load-bearing, which is the part most likely to
get quietly simplified back. Spending a token has to be one operation, not a `SELECT` that checks
`revoked_at` and an `UPDATE` that sets it: two requests carrying the same live token both pass a
prior check, because neither has written anything yet, and both go on to issue. The `UPDATE` already
carries `AND revoked_at IS NULL`, so it settles the race by itself. Under READ COMMITTED the second
writer blocks on the row lock, re-evaluates its predicate against the committed version, finds
`revoked_at` set, and matches nothing. Reading the count is all that turns that into an answer:
zero rows means someone else spent the token, which is replay, and gets the family revoked like any
other replay. The `row.RevokedAt != nil` check earlier in `Refresh` is not redundant with it. That
one catches a token spent long ago and is where the common case is diagnosed; the row count catches
the few milliseconds the check cannot cover.

A client that fires two refreshes concurrently on one token used to log itself out here, and that
was the single most likely false positive in the design: the panel calls `refreshSession` on every
fresh tab and every reload, by design, because the access token is memory-only, and
`refreshInFlight` in `admin/lib/api.ts` is module-scoped, so it collapses callers within a tab and
nothing across tabs. Two tabs restored together both send the same cookie, one wins, the loser
matches zero rows and killed the family. The grace window above is what absorbs it: the loser
arrives seconds after the winner committed, finds a live successor, and is resumed. Serialising
tabs with `navigator.locks` was the other candidate fix and is deliberately not here — it would
have needed a feature detection and a fallback path to cover the browsers without it, and all it
saves now is one wasted round trip.

Every failure inside `Refresh` returns the same `errInvalidToken` and the same 401. "Already
spent", "never existed" and "admin was deleted" told apart would tell a thief exactly when the real
admin noticed. The `token_reuse_detected` row is where that distinction lives instead, visible to
the operator and not to the caller.

`POST /api/auth/login` and `POST /api/auth/refresh` are public and rate limited, reusing
`leadLimiter`'s `KeyGenerator` shape (factored out as `clientKeyGenerator` in
`internal/http/routes/public.go`): an unresolvable `c.IP()` gets a unique key rather than joining
every other caller's bucket, for the same reason documented there. `POST /api/auth/logout` is
public and deliberately **not** limited. It authenticates with the refresh cookie rather than an
access token, so it still works once the access token has expired, which is when someone is most
likely to click Sign out, and a throttle there would strand them in a session they are trying to
end. There is nothing to guess at either: it reveals nothing and grants nothing.

They are limited separately, though, by two functions and not one. `loginLimiter` stays at five per
fifteen minutes; `refreshLimiter` allows thirty in the same window. Refresh used to share the five,
counting successes, and the panel refreshes once per fresh tab and once per reload by design because
the access token is memory-only — so six reloads in a morning, which is ordinary, spent the budget
and finding 6's cleared session put the admin on the login form. Behind office NAT several admins
share one bucket and reach it sooner, and a stranger on that NAT could spend all five on garbage and
lock every admin behind that address out for the quarter hour. Being generous here is cheap: a
refresh presented without a valid cookie grants nothing at all, so there is no secret to guess at
this endpoint the way there is at login. (Calling `loginLimiter()` twice would not have shared a
bucket either — each call builds its own `limiter.New` with its own storage — but two names say what
one name used twice did not.)

Per client is not the whole of it. The limiter counts requests; it does not care what they are for,
so five per window is five guesses at the admin password as readily as five contact submissions.
`login_attempts` adds a backoff on top, in `internal/service/auth`, that counts failures against one
email from one source. `Login` reads the row before `GetAdminByEmail`, `noteFailure` writes one on
both credential-failure branches, and from the fifth failure that pair is refused for a minute,
doubling with each further failure to a one-hour cap (`lockDuration`). A refused attempt gets
the same `rate limited` 429 the limiter returns, so a client needs one case rather than two. An
attacker spread across a thousand source addresses is charged the backoff a thousand times over
rather than once, which is a real weakening compared with a lock that spanned the account, and the
reason it is not optional is below.

Four things about that shape are load bearing. The read happens before the account lookup and does
not depend on the account existing, and the write happens on **both** failure branches, so a row
exists for an unregistered email too — otherwise the presence of a lockout would prove an account
exists, which is exactly the leak `dummyPasswordHash` closes on the timing side. Both branches also
still cost one bcrypt each, for the same reason. The early return for a refused email is fast, and
that is fine rather than an oracle: it is keyed on an email this caller, from this address, just
failed against five times, so it tells them only about their own attempts, and adding a bcrypt call
to "match timing" there would be cargo cult. And the curve caps instead of latching, because a lock
that never lapses is a denial of service against whoever it names — an authentication problem traded
for an availability one.

The cap alone did not deliver that last property, and no cap could. A lock is a refusal to evaluate
the password, and evaluating the password is the only way to tell the admin from a stranger, so a
lock that covers the whole account refuses both. Anyone who knew the address could send one failed
login each time the lock lapsed, four requests an hour, and keep the admin off the panel for as
long as they cared to. Decaying the count does not close that either: it raises the rate the
attacker has to sustain and leaves the address shut most of the time.

So the fourth load-bearing piece is the key. `login_attempts` is keyed on `(email, ip)`, not on
`email`, and the lock belongs to the source that earned it. A stranger hammering the admin's
address locks out their own source; the admin signing in from anywhere else never meets a lock. The
deliberate cost is that the backoff no longer spans source addresses. An attacker spread across
many of them pays it once per address rather than once in total, and that is the same property as
the denial of service, so it could not be kept. `loginLimiter` still allows each of those addresses
only five attempts per fifteen minutes.

The residual is worth naming, because it is not nobody. An attacker who shares a source address
with the admin can still lock that address out: office NAT, a shared VPN egress, or a deployment
behind a proxy where `PROXY_HEADER` is set and `TRUSTED_PROXIES` is not, which collapses every
caller onto the proxy's own address. That case is real and much narrower than an address anyone on
the internet can shut down.

`ip` is `text` and not `inet` because the key needs a value for "no resolvable client address", and
`inet` has none. `Login` never writes that value. With no address it skips the lockout entirely, reading
nothing, recording nothing and locking nothing, for the reason `clientKeyGenerator` gives an
unresolvable caller a key of their own: one shared bucket for everyone without an address is the
account-wide lock under another name. The audit rows are written either way.

The decay sits on top of that. `RecordLoginFailure` resets the count to one when the previous
failure for that pair is older than `loginFailureDecay`, thirty minutes, instead of incrementing
it. Thirty has a wall on each side and satisfying one by breaking the other is the easy mistake.

It is **shorter** than the one-hour cap, so a source that served a full-length lock comes back with
its count reset and has to climb the curve again rather than re-locking on its next failure
forever. A constant assertion beside the two values fails the build if the decay is ever raised to
or past the cap.

It is also **longer** than `loginLimiter`'s fifteen-minute window, and nothing in the code can
enforce that half. A decay shorter than the limiter's window is spent before the limiter lets the
next attempt through, so the count resets between every window and the curve never climbs past its
first step — the backoff then costs an attacker nothing the limiter was not already costing them.
Measured over ten hours against the limiter, a ten-minute decay let one source have 200 guesses
evaluated with the count never passing five; thirty minutes against the hour cap cuts that to 80.
Change either constant and check both walls, not just the one the build tests. The window is a timestamp
computed in Go and passed as `decay_before`, not an interval literal in the SQL, for the same reason
the curve is in Go: it is policy, and storage only compares.

The count the window is computed from comes from the row `RecordLoginFailure` returns, not from the
row `Login` read on the way in, and that is the difference between a working backoff and a
decorative one. Twenty requests firing at once all read a count of zero up front, so a window
derived from that read is "not yet" twenty times over and the address finishes the burst with no
lock at all. Read back from the increment, each request gets its own place in the sequence, and
`ExtendLoginLock` writes the window in a second statement, under a `GREATEST` so the longest window
stands rather than the last one written. The price is one more round trip on a failed login past
the threshold, next to the ~200ms of bcrypt that request has already spent.

What that does not buy is a burst costing one guess. A request already past the lock check when the
lock lands is not refused retroactively, so N simultaneous guesses still get N answers: twenty at
once measure as twenty 401s, after which the address is locked for an hour and the next twenty
are all refused. The bound is N guesses per window, not one. Closing that needs the check and
the increment to happen in the same statement, which is a larger change than the backoff itself.

`lockDuration` shifts `time.Minute` left by `failures - lockAfterFailures`, not by the failure
count, and both of its guards are load bearing for different reasons. `d > maxLockDuration` does
most of its work on ordinary values: only failures 5 through 10 return a window below the cap,
so that test is what clamps every count from 11 to 32. Past 32 the shift runs off the end of an int64.
Between 33 and 57 the result is negative for fifteen of those counts and, for the other ten, a
positive value far above the cap, and from 58 up it is exactly zero. Only `d <= 0` catches the
negatives and the zeros, and without it an attacker who kept failing would reach a lock that had
already expired.

A shift of 60 is worth pinning down, because checking it the obvious way misleads. Written as the
constant expression `time.Minute << 60` it does not compile at all: Go evaluates constant shifts at
arbitrary precision and the result overflows `int64`. The shift count here is a variable, and a
variable shift of 60 yields exactly `0s`. That is the value the guard has to catch.

`ClearLoginAttempts` empties the row on a successful sign-in, and `PruneLoginAttempts`, also on the
login path, drops rows whose last failure is older than `loginAttemptStale`, a day, and that are not
inside a live lock window. It prunes on staleness, not on the lock, and that ordering is the point.
The predicate used to be `locked_until IS NOT NULL`, and a row only gets `locked_until` at the fifth
failure, so an attacker who stopped at four per address left one permanent row per address tried —
written by unauthenticated requests, and exactly the "spray across a million addresses" the prune
existed to bound. `last_failure_at` is the column it now scans, with an index on it, and the
`locked_until` half stays only as a guard: a row still inside its lock window is evidence of
something current however old its last failure looks. A day is well past `loginFailureDecay`, so the
prune can never delete a row a live decision would still have read.

One limit remains, and it is a known one rather than a surprise. The prune runs only on a successful
login, so a site nobody signs in to never collects anything. Whoever next touches this should move
it onto a timer.

The refresh token never appears in a response body. `Login` and `Refresh` both write it with
`setRefreshCookie` (`internal/http/handlers/auth/cookie.go`) as `HttpOnly; Secure; SameSite=Strict;
Path=/api/auth`, and `models.RsAuth` carries only the access token and the admin profile. The token
lives `JWT_REFRESH_EXPIRE_DAYS`, so one copy in a place a script can reach turns a single XSS into a
week of access. `Path` is the second half of that: no `/api/admin/*` request carries the cookie, so
it cannot be picked out of a proxy log or an access log of a request that had no use for it.
`clearRefreshCookie` repeats the same `Path` on purpose. A mismatched path is a different cookie to
the browser, and the original would quietly survive the clear.

None of those attributes matter if the browser never keeps the cookie in the first place. It keeps
one from a cross-origin response only when that response carries
`Access-Control-Allow-Credentials: true`, which is why `internal/http/routes` sets
`AllowCredentials` and why `CORS_ORIGINS` must name the panel's origin. `Authorization` is in
`AllowHeaders` for the same reason on the `/api/admin/*` side: a browser will not send a header the
preflight response did not list. `X-Requested-With` is in that list for the same reason again, on
the two auth routes that now require it.

`SameSite=Strict` is most of why there are no CSRF tokens on these endpoints. A request that did not
originate from this site does not carry the cookie, and `/api/admin/*` wants an `Authorization`
header that no cross-site form can set.

It is not all of it, because SameSite is evaluated per *site*, not per origin. A sibling subdomain —
a customer's blog on `blog.example.com` — is the same site as the panel, so the Strict cookie does
travel on its requests, and `/api/auth/refresh` and `/api/auth/logout` took no body and no custom
header, which made them CORS-simple and preflight-free. Such a page could not read either answer, so
nothing leaked, but it could sign the admin out whenever it liked and rotate the refresh cookie
underneath a live tab. `requireNonSimpleRequest` in `internal/http/routes/public.go` closes that by
demanding `X-Requested-With` on both routes. Only its presence is checked; the value is the old
XMLHttpRequest convention because that is the name a reader recognises. What does the work is that a
browser will not let a page set a non-safelisted header cross-origin without first passing a
preflight, which the `CORS_ORIGINS` allowlist governs. `Accept` would not have served: it is
CORS-safelisted, so setting it leaves a request simple. The panel sets the header in
`apps/web/src/admin/lib/api.ts`, on `apiFetch` and on `performRefresh`'s own `fetch`, and pays no
preflight for it because it is same-origin with the API in both development and production.

The middleware runs **before** the refresh limiter on that route, not after. The forged requests it
refuses come from the admin's own browser and so arrive on the admin's own IP; counting them would
let a page on a sibling subdomain spend the admin's refresh budget and land them on the login form
anyway, which is most of what the check exists to prevent.

`Secure` is the one attribute that varies, and it varies on
exactly one input: `handlers.New` passes `!cfg.IsDevelopment()`. Development speaks plain HTTP to
localhost, where a browser refuses to store a Secure cookie at all, so the flag has to come off
there and nowhere else. `conf.(*Config).IsDevelopment` exists so that decision reads the same string
`conf.Load` reads, rather than a second hardcoded `"development"` drifting somewhere else.

`Service.Logout` revokes through `revokeFamily`, not through `RevokeRefreshTokenFamily` directly,
and that is not interchangeable. The raw query outside the advisory lock hits the same race
documented above: an `UPDATE` cannot see a row inserted after its own statement began, so signing
out in one tab while another tab is mid-rotation can leave the successor alive in a family that was
just revoked. `Logout` returns nothing at all. A logout that reported failure would give a caller
something to probe with, and the handler expires the cookie either way, so the session is over from
the browser's side even when the ledger write failed. A stale live row is bounded by the token's own
expiry.

The handler answers 200 for a missing cookie, a malformed one and a valid one alike. Distinguishing
them would answer a question the caller has not authenticated to ask, and no client would act
differently on the answer.

**Signing out is not instant, and this is the design rather than an oversight.** `AuthMiddleware`
validates the access token's signature and claims and looks nothing up, so the token already in a
tab's memory keeps reading `GET /api/admin/leads` until its own `exp` passes — up to
`JWT_ACCESS_EXPIRE_MINUTES`, fifteen minutes by default. That is true after a logout, after a family
revocation, and after the admin row is deleted. What *is* immediate is that the family is dead, so
no new token is ever issued: the refresh cookie is spent, `Refresh` re-reads the admin row, and the
next renewal fails. The stateless-JWT bargain is what buys an admin request with no database read on
it, and the price is that window. Closing it means a revocation check on every admin request, which
is a deliberate trade to revisit if the panel ever holds something worth fifteen minutes. Operators
signing out on a borrowed machine should know the number, which is why `apps/web/README.md` states
it where the Sign out button is described.

`./cmd seed-admin <email>` creates an admin account, following `habido-back`'s `./cmd cron` pattern
of dispatching on `os.Args[1]` in the same binary rather than shipping a second one. It reuses
`conf.Load` and the already-migrated pool, so it can never disagree with the server about which
database it writes to. It refuses a password under 12 characters, counted with
`utf8.RuneCountInString` rather than `len`: `len` counts bytes, six Cyrillic characters are twelve
bytes, and a kit whose default locale is Mongolian would have waved a six-character admin password
through. It prints nothing but the created email on success — not the password, not the hash, not
the row's id — so a seeded password never reaches a terminal scrollback or a CI log.

That promise depends on the password not being an argument, which it was and no longer is. As
`args[1]` it went into the shell's history file, the terminal scrollback, and the process table
where any local user's `ps` could read it for as long as `go run` took to compile and run — so a
careful success path bought nothing while the documented way to invoke the command leaked the value
before it started. `readSeedPassword` takes one line off stdin and trims the line ending. One line,
not everything stdin has: reading to EOF would quietly accept a whole file as a password. `io.EOF`
with no line ending is success, because that is what a `printf '%s'` pipe sends. It prompts on
stderr only when stdin is a terminal, so a piped invocation's stdout stays exactly the created email
and nothing else.

`make seed-admin email=...` wraps it, and there is deliberately no `password=` variable any more.
The target prompts, turns terminal echo off with `stty` around the read, and pipes the value in, so
the password reaches neither the argument list nor the scrollback. A second seed of the same email
fails on `admin_users`'s unique constraint on `email` rather than silently creating a duplicate.

### Go tests

```bash
cd apps/api && go test ./...
```

Integration tests use `github.com/tanasoft1/testkit/pgkit` and need Docker. Set environment values
with `t.Setenv`, never by writing a scratch `.env`: `conf.LoadEnvFile` is `sync.Once` guarded, so the
first read wins for the whole test binary and a second `.env` is silently ignored rather than
erroring. Measured with two directories whose `.env` files set different values; the second read
returned the first directory's.

Migrations are safe to run from more than one replica. golang-migrate's Postgres driver takes a real
session-level `pg_advisory_lock`, so a second replica blocks, then sees `ErrNoChange` and boots, and
Postgres releases the lock if a backend dies. The one caveat: the library wraps acquisition in a 15
second `DefaultLockTimeout`, so a migration slower than that makes other replicas exit non-zero for
an orchestrator to retry. Harmless today, worth knowing before writing a heavy backfill.

### Serving the site and Docker

`apps/api/internal/static` embeds `apps/web`'s build output with `//go:embed all:dist`, so one
binary serves the prerendered site on `/` and the API on `/api/*`. `//go:embed` is a build error
when its pattern matches nothing (hit in phase 2a: the migrations package would not compile until
a `.sql` file existed), and the web build output is a build artifact that must never be committed
— so a fresh clone needs something committed under `internal/static/dist` before anyone has run a
web build. `dist/.placeholder`, an empty file, is that something: `all:dist` matches it because
`all:` includes dotfile names and a bare `dist` pattern does not. `.gitignore` then excludes
everything else under `internal/static/dist/` except that one file.

`HasSite()` tells the server whether it embedded a real build or just the placeholder, by checking
for `dist/index.html` rather than the placeholder's absence — `make build` copies the web build in
without deleting `dist/.placeholder` first, so the placeholder is present alongside a real build
too. An API-only binary (no web build ever embedded) is a legitimate thing to run, so serving is
conditional on `HasSite()`: mounted, the site's own catch-all would otherwise answer every page
request with a confusing 404 instead of a working API. Without a real build, startup logs one
warning naming `make build` and the API still serves.

`make build` (in `apps/api/makefile`) is `build-site` then `go build`: it builds `apps/web`, then
wipes `internal/static/dist` and recreates it from that output, rather than copying over the top.
Every filename the web build produces is content-hashed, so a stale asset a previous build produced
and the new one no longer does would otherwise stay embedded forever — nothing would ever overwrite
it. `touch`ing `dist/.placeholder` afterwards keeps the tracked file from being left missing.

`helmet.New()`'s defaults (`CrossOriginEmbedderPolicy: require-corp`,
`CrossOriginResourcePolicy: same-origin`, verified against Fiber v2.52.8's `ConfigDefault`) were
harmless while this binary served only JSON. The moment it also serves the site, `require-corp`
blocks every cross-origin subresource that does not send a matching header — third-party widgets,
CDN assets, embedded iframes — and the failure is browser-side only, with no server-side signal, so
it looks like the site is broken for no reason. `internal/http/routes/routes.go` sets both back to
the browser defaults (`unsafe-none`, `cross-origin`). Restoring the stricter defaults is the thing
to undo first if a served site's third-party embeds start failing silently.

The `Dockerfile` is three stages: a Node stage builds `apps/web`, a Go stage copies that output into
`internal/static/dist` and compiles the binary, and a minimal `alpine` stage carries only the binary
plus `ca-certificates` (SES calls over TLS) and `tzdata`. Neither toolchain reaches the final image.
`docker-compose.yml`'s `api` service depends on `db` with `condition: service_healthy`, because the
migrate-on-startup call in `cmd/main.go`'s `run()` would otherwise race Postgres's own startup on the
container's first boot. Inside that one container the site and the API share one origin, so
`CORS_ORIGINS` has far less to do than in the local development of a `--backend=api` project, where
the Vite dev server and this API are two different origins. A `--backend=admin` project is not in
that position: its `vite.config.ts` proxies `/api` here, so the panel is same-origin in development
too. Either way, a request from the served site to its own `/api/leads` is same-origin and never
goes through CORS at all.

Two scaffolder gaps surfaced when `apps/api/internal/static/` and the `api` compose service were
added, both in `cli/`, not `apps/api/`: `cli/kit-manifest.mjs`'s `NEVER_COPY_ANYWHERE` refuses any
path with a `dist` segment, which made `--backend=api` throw on `internal/static/dist` before that
directory existed — `API_STATIC_DIST` and `API_STATIC_PLACEHOLDER` there carve out an exact-path
exception for the placeholder only, so a stray real build left under `dist` by a prior `make build`
is still refused rather than silently shipped. And `cli/generate.mjs`'s generated `.gitignore` had
no equivalent carve-out for a scaffolded project's own `api/internal/static/dist` — unfixed, a
scaffolded project's own `git init` would never track its placeholder, reintroducing this exact
fresh-clone build failure one level further out, in every project this kit generates. Both fixes
apply only when a backend is scaffolded, so the four `--backend=none` snapshot variants are
untouched by either.
