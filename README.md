# Landing Kit

Scaffolds a bilingual (Mongolian + English) landing site: prerendered static HTML, per-locale SEO,
swappable blocks, and an optional Go backend for the contact form.

```bash
pnpm dlx @tanasoftllc/landing-kit@latest my-site     # pnpm
npx --yes @tanasoftllc/landing-kit@latest my-site    # npm
yarn dlx @tanasoftllc/landing-kit@latest my-site     # yarn 2+
```

It asks five short questions, then writes a standalone TanStack Start project. The generated
project has no dependency on this package.

**Full documentation for a generated site is [apps/web/README.md](./apps/web/README.md)**, which is
also the README the scaffolder copies into your project.

## The backend is optional

The fourth question has three answers, and it defaults to `none`:

```bash
pnpm dlx @tanasoftllc/landing-kit@latest my-site                  # static site, nothing to run
pnpm dlx @tanasoftllc/landing-kit@latest my-site --backend=api    # plus a Go service and Postgres
pnpm dlx @tanasoftllc/landing-kit@latest my-site --backend=admin  # plus a panel for reading the leads
```

A brochure site should not arrive with a database it does not need, which is why `none` is the
default rather than the other way round.

With `--backend=api` the project also gets an `api/` directory: a GoFiber service on PostgreSQL that
receives contact form submissions, stores them, and emails the site owner. It carries admin
authentication and a `GET /api/admin/leads` endpoint for reading what came in. Its own
documentation is in that directory.

`--backend=admin` is that same service plus a client for it, not a different one. The project gets
everything `api` gets, and on top of it a React admin panel at `/admin`: a login screen and a table
of the leads the form has collected, in `src/routes/admin` and `src/admin`. The panel is served by
the same build as the marketing pages and reads the same API, so there is no third process to run.

It is also the only answer that adds to what the frontend installs. The panel pulls in fourteen
packages: Radix primitives, TanStack Table, `lucide-react` and the rest of the shadcn base, one of
which a site with the contact block already had. They land in the panel's own route chunks, so a
visitor reading the marketing pages downloads none of them; what grows is `node_modules`. A project
answering `none` or `api` receives none of them and none of the panel's files: no `src/admin`, no
`/admin` route, nothing in `package.json`.

## This repository

| Path | What it is |
|---|---|
| `apps/web/` | The site template. A scaffolded project is this tree, flat. |
| `apps/api/` | The Go service. Lands in a scaffolded project as `api/`, and only when asked for. |
| `cli/` | The scaffolder. Never copied into a generated project. |
| `tools/` | Maintainer commands: smoke builds, Lighthouse, scaffold snapshots. Not published. |

The kit is a pnpm workspace and a generated project is not. `apps/web` becomes the project root and
`apps/api` becomes `api/` beside it, which is what keeps `add-block` and `add-page` unaware that a
backend exists at all. `WEB_ROOT` and `API_DEST` in `cli/kit-manifest.mjs` are what reconcile the
two shapes.

Diagrams of all three, of the one exchange every site has with the API, and of the panel's:
[ARCHITECTURE.md](./ARCHITECTURE.md).

Working on the kit itself? See [MAINTAINERS.md](./MAINTAINERS.md).
