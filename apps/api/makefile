.PHONY: run dev build build-site test lint lint-fix sqlc migrate-create seed-admin

run:
	go run ./cmd

dev:
	air

# Wipes dist first, or old hashed assets stay embedded forever. touch restores the tracked placeholder.
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

# Forward-only: the service runs up migrations at startup and never rolls back, so there is no
# .down.sql to write.
migrate-create:
	@test -n "$(name)" || (echo "usage: make migrate-create name=add_something" && exit 1)
	@ts=$$(date +%Y%m%d%H%M%S); \
	  touch internal/db/migrations/$${ts}_$(name).up.sql; \
	  echo "created internal/db/migrations/$${ts}_$(name).up.sql"

# Prompts for the password with echo off and pipes it in, so it never lands in shell history or `ps`.
seed-admin:
	@test -n "$(email)" || (echo "usage: make seed-admin email=admin@example.mn" && exit 1)
	@printf 'Password: ' >&2; \
	  stty -echo 2>/dev/null || true; \
	  read -r pw; \
	  stty echo 2>/dev/null || true; \
	  printf '\n' >&2; \
	  printf '%s' "$$pw" | go run ./cmd seed-admin "$(email)"
