# Landing Kit

Scaffolds a bilingual (Mongolian + English) landing site: prerendered static HTML, per-locale SEO,
and swappable blocks.

```bash
pnpm dlx @dewsoft/landing-kit@latest my-site     # pnpm
npx --yes @dewsoft/landing-kit@latest my-site    # npm
yarn dlx @dewsoft/landing-kit@latest my-site     # yarn 2+
```

It asks five short questions, then writes a standalone TanStack Start project. The generated
project has no dependency on this package.

**Full documentation for a generated site is [apps/web/README.md](./apps/web/README.md)**, which is
also the README the scaffolder copies into your project.

## This repository

| Path | What it is |
|---|---|
| `apps/web/` | The site template. A scaffolded project is this tree, flat. |
| `cli/` | The scaffolder. Never copied into a generated project. |
| `tools/` | Maintainer commands: smoke builds, Lighthouse, scaffold snapshots. Not published. |

Working on the kit itself? See [MAINTAINERS.md](./MAINTAINERS.md).
