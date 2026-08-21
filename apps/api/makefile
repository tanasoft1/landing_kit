.PHONY: run dev build build-site test lint lint-fix sqlc migrate-create seed-admin

run:
	go run ./cmd

dev:
	air

# Rebuilds the web app and re-embeds its output, wiping internal/static/dist first rather than
# copying over the top of it. A stale asset from a previous build that the new one no longer
# produces would otherwise stay embedded forever: every filename is content-hashed, so nothing
# ever overwrites it, and go:embed has no notion of "files this build removed". touch restores
# dist/.placeholder afterwards so the one file this directory always tracks in git is never left
# missing from a working tree that just ran this.
build-site:
	cd ../web && pnpm build
	rm -rf internal/static/dist
	mkdir -p internal/static/dist
	cp -R ../web/dist/client/. internal/static/dist/
	touch internal/static/dist/.placeholder

build: build-site
	go build -o bin/landing-api ./cmd

test:
	go test ./...

lint:
	golangci-lint run

lint-fix:
	golangci-lint run --fix

sqlc:
	sqlc generate

migrate-create:
	@test -n "$(name)" || (echo "usage: make migrate-create name=add_something" && exit 1)
	@ts=$$(date +%Y%m%d%H%M%S); \
	  touch internal/db/migrations/$${ts}_$(name).up.sql \
	        internal/db/migrations/$${ts}_$(name).down.sql; \
	  echo "created internal/db/migrations/$${ts}_$(name).{up,down}.sql"

# Wraps `./cmd seed-admin`, not a raw `go run` one-liner, so the usage message is the same
# whether the missing argument is email or password rather than whatever go run's own failure
# happens to print.
seed-admin:
	@test -n "$(email)" || (echo "usage: make seed-admin email=admin@example.mn password=..." && exit 1)
	@test -n "$(password)" || (echo "usage: make seed-admin email=admin@example.mn password=..." && exit 1)
	@go run ./cmd seed-admin "$(email)" "$(password)"
