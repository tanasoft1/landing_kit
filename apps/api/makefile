.PHONY: run dev build test lint lint-fix sqlc migrate-create

run:
	go run ./cmd

dev:
	air

build:
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
