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

`tools/scaffold-snapshot.mjs` hashes the full output of five answer combinations and compares
against `tools/__snapshots__/`. `pnpm verify` runs it.

A failing snapshot means generated projects changed. That is often intended: re-record with
`node tools/scaffold-snapshot.mjs record`, then **read the diff** before committing it. The
snapshot's value is entirely in that read; re-recording without looking makes it decoration.

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

Published to npm as `@dewsoft/landing-kit`.

```bash
npm version patch     # or minor / major
npm publish
```

2FA is on for writes, so `npm publish` prompts for a one-time code.

Before publishing, test the real tarball rather than the working tree — that is what a user gets:

```bash
npm pack --pack-destination /tmp
cd /tmp && tar xzf dewsoft-landing-kit-*.tgz
node package/cli/index.mjs /tmp/smoke-scaffold --yes
```

Then install and `verify` that scaffold. This catches a missing entry in `files`, which no other
check can see.

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

The asymmetry with the CORS guard is intentional. `CORS_ORIGINS` is refused for any environment that
is not `development`, because a wrong origin is simply broken everywhere. `NOTIFY_DRIVER=log` is
refused only in `production`, because a staging site emailing a real client is worse than a staging
site not emailing.

### Admin authentication

`internal/service/auth`, `internal/utils/secure` and `internal/http/handlers/middleware.go` mirror
`psyfint_v2_back`'s login/refresh service and Bearer-token middleware: HS256, one secret, and the
same Mongolian 401 messages. One deliberate difference: `Login` always runs bcrypt, even when the
email does not exist, comparing against a fixed dummy hash instead of returning early on
`pgx.ErrNoRows`. Returning early is faster, and that speed difference is itself an oracle — bcrypt
is deliberately slow, so a request that skips it answers measurably sooner than one that ran it,
letting a caller enumerate registered emails by timing alone even though both cases return the
identical error message.

`JWT_SECRET` has no default outside development. `conf.Load` refuses to start when
`APP_ENV` is anything but `development` and the secret is empty or shorter than 32 characters:
HS256 with a short secret is brute-forceable offline once an attacker holds one token to check
guesses against, and an empty secret makes every admin token forgeable by anyone. Development gets
a documented, obviously-a-placeholder default so `pnpm dev` runs with no `.env` at all.

Access and refresh tokens are not interchangeable. `secure.Claims.TokenType` is checked on every
validation, not only at issue time, because a refresh token lives far longer (days, versus an
hour for an access token) — accepting one as the other would silently extend a stolen or leaked
token's usefulness to the longer of the two lifetimes. `ValidateAccessToken` and
`ValidateRefreshToken` each reject the other token type, and the keyfunc in `parseToken` asserts
`*jwt.SigningMethodHMAC` so a token signed with a different algorithm is rejected before its
signature is even checked.

`POST /api/auth/login` and `POST /api/auth/refresh` are public and rate limited, reusing
`leadLimiter`'s `KeyGenerator` shape (factored out as `clientKeyGenerator` in
`internal/http/routes/public.go`): an unresolvable `c.IP()` gets a unique key rather than joining
every other caller's bucket, for the same reason documented there.

`./cmd seed-admin <email> <password>` creates an admin account, following `habido-back`'s
`./cmd cron` pattern of dispatching on `os.Args[1]` in the same binary rather than shipping a
second one. It reuses `conf.Load` and the already-migrated pool, so it can never disagree with the
server about which database it writes to, and it refuses a password under 12 characters. It prints
nothing but the created email on success: not the password, not the hash, not the row's id, so a
seeded password never reaches a terminal scrollback or a CI log. `make seed-admin email=... password=...`
wraps it. A second seed of the same email fails on `admin_users`'s unique constraint on `email`
rather than silently creating a duplicate.

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
`CORS_ORIGINS` has far less to do than in local development, where the Vite dev server and this API
are two different origins — a request from the served site to its own `/api/leads` is same-origin
and never goes through CORS at all.

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
