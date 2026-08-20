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

The kit is a pnpm workspace, with `apps/web/` as its only package today.

| Path | What it is |
|---|---|
| `apps/web/` | The web template. This is what a scaffolded project becomes. |
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

`tools/scaffold-snapshot.mjs` hashes the full output of four answer combinations and compares
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
