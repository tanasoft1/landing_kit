# The Go API

`api/` is a GoFiber service on PostgreSQL. Today it does one thing: accept and store this site's
contact form submissions, with a honeypot and a timing floor as spam defences and an email
notification on every new lead. It is not a CMS — the marketing pages stay static, prerendered at
build time, and this service never touches them.

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

## Tests

```bash
cd api && go test ./...
```

Integration tests need Docker. Set environment values for a test with `t.Setenv`, never by writing
a second `.env` — the first `.env` read wins for the whole test binary and a later one is silently
ignored rather than erroring.
