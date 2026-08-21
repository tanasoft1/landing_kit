# One image serving the prerendered site on / and the API on /api/*.
#
# Three stages, and only the last one ships: the first two hold an entire Node and Go toolchain,
# which a container serving a handful of static files and JSON has no business carrying.

# --- stage 1: build the site -------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /repo

# package.json + pnpm-workspace.yaml + the lockfile first, apps/web/package.json alongside them,
# so `pnpm install` is its own Docker layer and only re-runs when a dependency actually changed --
# not on every source edit below.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN npm install -g pnpm@10.13.1 && pnpm install --frozen-lockfile

COPY apps/web ./apps/web
RUN pnpm --filter @dewsoft/landing-kit-web build

# --- stage 2: build the Go binary --------------------------------------------------------------
FROM golang:1.25-alpine AS builder
WORKDIR /src

# go.mod/go.sum before the rest of the source, same layer-caching reason as the web stage above.
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ ./
# Overwrites internal/static/dist wholesale with the real build's output. dist/.placeholder never
# reaches this stage at all -- .dockerignore excludes apps/api/internal/static/dist from the build
# context entirely -- and that is fine here specifically: unlike a fresh clone, this directory is
# never compiled from until AFTER this COPY has given `go:embed all:dist` real content to match.
COPY --from=web /repo/apps/web/dist/client/. ./internal/static/dist/

# CGO_ENABLED=0: every driver this service uses (pgx, golang-migrate) is pure Go, so a static
# binary is not a compromise, and it is what lets the final stage skip glibc entirely.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/landing-api ./cmd

# --- stage 3: the image that actually ships --------------------------------------------------
FROM alpine:3.20
WORKDIR /app

# ca-certificates: this binary calls out to AWS SES over TLS when NOTIFY_DRIVER=ses. tzdata: log
# timestamps are formatted with a location-aware layout (see cmd/main.go's setupLogging).
RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -g 1000 appgroup && \
    adduser -u 1000 -G appgroup -s /bin/sh -D appuser

COPY --from=builder /out/landing-api .
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000
CMD ["./landing-api"]
