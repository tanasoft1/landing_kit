// The generate layer: files a scaffold can't inherit, written fresh from the answers. Nothing is
// copied here. `tsconfig.json`, `pnpm-workspace.yaml` and `docker-compose.yml` are templated
// because they aren't in `files`, so they don't exist under `pnpm dlx`. Each has a drift check
// that runs when the kit's own copy is on disk.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { blockFiles } from './add.mjs'
import { kitPath } from './kit-manifest.mjs'
import { BLOCK_ORDER, CUSTOM_VARIANT } from './prompts.mjs'

// --- the dependency split ----------------------------------------------------------------------
// The kit keeps every package in devDependencies; a generated project wants the normal split.
// Versions come from the kit's manifest, grouping from the lists below. Every kit package must be
// in exactly one list, and every listed package must exist, or the CLI throws.

/** Shipped to the browser or imported by app code at runtime. */
const RUNTIME_DEPS = [
  '@fontsource-variable/inter',
  '@fontsource-variable/manrope',
  '@tanstack/react-router',
  '@tanstack/react-start',
  'motion',
  'react',
  'react-dom',
  // `src/integrations/submit-schema.ts` imports zod and is always copied.
  'zod',
]

/** Runtime, but only when the block that needs it was selected. */
const BLOCK_RUNTIME_DEPS = { contact: ['react-hook-form'] }

/**
 * Runtime, but only for `--backend=admin`. `react-hook-form` is also in
 * BLOCK_RUNTIME_DEPS.contact; the panel's login form needs it either way.
 */
const ADMIN_RUNTIME_DEPS = [
  '@hookform/resolvers',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label',
  '@radix-ui/react-slot',
  '@tanstack/react-table',
  'class-variance-authority',
  'clsx',
  'lucide-react',
  'react-hook-form',
  'sonner',
  'tailwind-merge',
  // The animation utilities the panel's sheet and dropdown use. The `@import` lives in
  // theme.css, which ships to every project, and `transformThemeCss` removes it without the panel.
  // That removal and this entry must move together.
  'tw-animate-css',
]

/** Needed to build, lint and type-check the project; never bundled. */
const BUILD_DEPS = [
  '@biomejs/biome',
  '@tailwindcss/vite',
  '@types/node',
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'tailwindcss',
  'typescript',
  'vite',
]

const CLASSIFIED = [
  ...RUNTIME_DEPS,
  ...Object.values(BLOCK_RUNTIME_DEPS).flat(),
  ...ADMIN_RUNTIME_DEPS,
  ...BUILD_DEPS,
]

// --- SEO copy ------------------------------------------------------------------------------------
// The kit's own wording, so a scaffold reads like the demo. `assertSeoCopyMatchesKit` checks it
// against the kit's `pages.config.ts`.
const PAGE_SEO = {
  home: {
    mn: { title: 'Эхлэл', description: 'Хурдан, хайлтад оновчлогдсон вэб хуудас.' },
    en: { title: 'Home', description: 'A fast, search-optimised landing page.' },
  },
  contact: {
    mn: { title: 'Холбоо барих', description: 'Бидэнтэй холбогдоорой.' },
    en: { title: 'Contact', description: 'Get in touch with us.' },
  },
}

/** The one placeholder `scripts/verify-build.mjs` fails on. Written here, asserted there. */
const URL_PLACEHOLDER = 'https://your-domain.example'

// --- primitives ----------------------------------------------------------------------------------

function readKitFile(kitRoot, rel) {
  const src = kitPath(kitRoot, rel)
  if (!existsSync(src)) throw new Error(`Kit is missing '${rel}' — cannot scaffold without it`)
  return readFileSync(src, 'utf8')
}

function writeOut(outDir, rel, text, written) {
  const dest = join(outDir, rel)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, text)
  written.push(rel)
}

// --- JSON, in Biome's formatting rather than JSON.stringify's ------------------------------------
// Biome collapses arrays and objects that fit in 100 columns; JSON.stringify never does. The
// generated project lints its JSON, so this writes Biome's shape.
const LINE_WIDTH = 100

const compactJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(compactJson).join(', ')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    if (entries.length === 0) return '{}'
    return `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${compactJson(v)}`).join(', ')} }`
  }
  return JSON.stringify(value)
}

/** `used` is how many columns this line has already spent before the value starts. */
function formatJson(value, indent, used) {
  const compact = compactJson(value)
  if (used + compact.length <= LINE_WIDTH) return compact
  // Scalars first: `Object.entries` on a string would expand it into one property per character.
  if (value === null || typeof value !== 'object') return compact
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    const items = value.map((v) => `${inner}${formatJson(v, inner, inner.length)}`)
    return `[\n${items.join(',\n')}\n${indent}]`
  }
  const items = Object.entries(value).map(([k, v]) => {
    const key = `${inner}${JSON.stringify(k)}: `
    return `${key}${formatJson(v, inner, key.length)}`
  })
  return `{\n${items.join(',\n')}\n${indent}}`
}

const json = (value) => `${formatJson(value, '', 0)}\n`

// Only tsconfig needs this now: `paths` takes one file and cannot branch. Either half
// type-checks the same, because both satisfy `ThemeModule` in theme.types.ts.
const themeFile = (answers) => (answers.theme === 'both' ? 'theme.both.tsx' : 'theme.single.tsx')

// --- package.json ---------------------------------------------------------------------------------

function kitManifest(kitRoot) {
  // The root package's version: that is what npm publishes.
  const rootPkg = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8'))
  if (typeof rootPkg.version !== 'string' || rootPkg.version === '') {
    throw new Error(
      "Kit package.json has no 'version' — `.kit/scaffold.json` records which kit version " +
        'generated a project, and a scaffold that cannot say so is not worth writing',
    )
  }
  // Dependency ranges come from the web template only. The root's Biome is for linting `cli/`.
  const pkg = JSON.parse(readKitFile(kitRoot, 'package.json'))
  // Both groups, since only the version range matters here.
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  for (const name of CLASSIFIED) {
    if (!Object.hasOwn(deps, name)) {
      throw new Error(
        `Kit apps/web/package.json has no '${name}', but cli/generate.mjs classifies it. A ` +
          'rename or removal upstream would otherwise drop it from every generated project ' +
          'with no other signal — update the dependency lists in cli/generate.mjs',
      )
    }
  }
  for (const name of Object.keys(deps)) {
    if (!CLASSIFIED.includes(name)) {
      throw new Error(
        `Kit apps/web/package.json lists '${name}', which cli/generate.mjs does not classify ` +
          'as runtime, block-only runtime, admin-only runtime or build. Add it to ' +
          'RUNTIME_DEPS, BLOCK_RUNTIME_DEPS, ADMIN_RUNTIME_DEPS or BUILD_DEPS ' +
          '— otherwise every generated project silently goes without it',
      )
    }
  }
  return { version: rootPkg.version, deps }
}

/**
 * `basename` is the directory name. npm package names are narrower (no uppercase, no spaces), so
 * it is normalised and `"Client Site"` still installs.
 */
function packageName(outDir) {
  const name = basename(outDir)
    .toLowerCase()
    .replace(/[^a-z0-9\-._]+/g, '-')
    .replace(/^[._-]+/, '')
    .replace(/-+$/, '')
  return name === '' ? 'landing-site' : name
}

function pickDeps(names, deps) {
  const out = {}
  for (const name of [...names].sort()) out[name] = deps[name]
  return out
}

// The pnpm a generated project declares. Separate from the kit's own, which builds the kit.
const PACKAGE_MANAGER = 'pnpm@12.4.2'

function packageJson(outDir, answers, { deps }) {
  const runtime = [...RUNTIME_DEPS]
  for (const [block, extra] of Object.entries(BLOCK_RUNTIME_DEPS)) {
    if (answers.blocks.includes(block)) runtime.push(...extra)
  }
  const hasAdmin = answers.backend === 'admin'
  if (hasAdmin) runtime.push(...ADMIN_RUNTIME_DEPS)
  const hasBackend = (answers.backend ?? 'none') !== 'none'
  // Calls the binaries directly, not `pnpm lint && …`, so `npm run verify` works without pnpm.
  // The Go steps go last because they end in `cd api`.
  const verify =
    'biome ci . && tsc --noEmit && node scripts/check-conventions.mjs && vite build && ' +
    'node scripts/verify-build.mjs' +
    (hasBackend
      ? ' && npm run api:sqlc && npm run api:build && npm run api:lint && npm run api:test'
      : '')
  return json({
    name: packageName(outDir),
    private: true,
    type: 'module',
    // Corepack enforces this pin. The scripts stay package-manager-neutral anyway, so removing
    // this line still leaves a project that works under npm.
    packageManager: PACKAGE_MANAGER,
    scripts: {
      dev: 'vite dev',
      build: 'vite build',
      typecheck: 'tsc --noEmit',
      lint: 'biome ci .',
      fix: 'biome check --write .',
      conventions: 'node scripts/check-conventions.mjs',
      verify,
      // Runnable on their own, matching the kit's script names. Not used by `verify` above.
      ...(hasBackend
        ? {
            'api:sqlc': 'cd api && sqlc diff',
            'api:build': 'cd api && go build ./...',
            'api:lint': 'cd api && golangci-lint run',
            'api:test': 'cd api && go test ./...',
          }
        : {}),
    },
    dependencies: pickDeps(runtime, deps),
    devDependencies: pickDeps(BUILD_DEPS, deps),
  })
}

// --- what ships must be installable ----------------------------------------------------------
// Walk the finished target, collect every bare import, and check each is in the `package.json`
// this run wrote. Per answer set: `lucide-react` in `src/admin` is fine, in `src/components` it
// breaks a `none` project.

// Built-ins Node resolves without a `package.json` entry. `node:` specifiers are handled apart.
const BUILTIN_MODULES = new Set(builtinModules)

// Comment lines are dropped first: the kit's comments quote imports, and those aren't imports.
const COMMENT_LINE = /^[ \t]*(?:\/\/|\/?\*)/
const stripCommentLines = (text) =>
  text
    .split('\n')
    .filter((l) => !COMMENT_LINE.test(l))
    .join('\n')

// Static `from '…'`, bare `import '…'`, dynamic `import('…')` and `require('…')`. A regex, not a
// parser, to avoid a dependency. The first pattern spans multi-line import clauses but can't run
// into the next statement.
const JS_SPECIFIERS = [
  /^[ \t]*(?:import|export)[ \t][^'"\n]*(?:\n[^'"\n]*)*?\bfrom[ \t]*['"]([^'"\n]+)['"]/gm,
  /^[ \t]*import[ \t]*['"]([^'"\n]+)['"]/gm,
  /\bimport[ \t]*\([ \t]*['"]([^'"\n]+)['"]/g,
  /\brequire[ \t]*\([ \t]*['"]([^'"\n]+)['"]/g,
]

// CSS `@import` counts too: the panel's `tw-animate-css` import sits in a file every project gets.
const CSS_SPECIFIERS = [/@import\s+['"]([^'"\n]+)['"]/g]

const SCANNED = { js: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], css: ['.css'] }

/**
 * The npm package a specifier names, or null. `@/…` is the project's source alias, not a scope.
 * Subpaths collapse to their package.
 */
function packageOfSpecifier(spec) {
  if (spec === '' || spec.startsWith('.') || spec.startsWith('/')) return null
  if (spec.startsWith('@/')) return null
  if (spec.startsWith('node:') || BUILTIN_MODULES.has(spec)) return null
  // `virtual:…`, `data:…` and Vite's other scheme-prefixed specifiers resolve to no package.
  if (/^[a-z][a-z0-9+.-]*:/.test(spec)) return null
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function collectSpecifiers(text, patterns) {
  const out = []
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    for (const m of text.matchAll(pattern)) out.push(m[1])
  }
  return out
}

/**
 * Every package the shipped source imports must be in the shipped `package.json`. Checked on the
 * target, not the kit: the kit always has the panel and its packages, so only a scaffold shows the
 * gap.
 */
function assertShippedImportsAreDeclared(outDir, packageJsonText) {
  const pkg = JSON.parse(packageJsonText)
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ])
  const problems = []
  const walk = (rel) => {
    for (const entry of readdirSync(join(outDir, rel || '.'), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(childRel)
        continue
      }
      const patterns = SCANNED.js.some((e) => entry.name.endsWith(e))
        ? JS_SPECIFIERS
        : SCANNED.css.some((e) => entry.name.endsWith(e))
          ? CSS_SPECIFIERS
          : null
      if (!patterns) continue
      const text = stripCommentLines(readFileSync(join(outDir, childRel), 'utf8'))
      for (const spec of collectSpecifiers(text, patterns)) {
        const name = packageOfSpecifier(spec)
        if (name && !declared.has(name)) problems.push(`  ${childRel}  imports '${spec}'`)
      }
    }
  }
  walk('')
  if (problems.length === 0) return
  // Sorted and de-duplicated: one package imported by six files is one mistake.
  const unique = [...new Set(problems)].sort()
  throw new Error(
    'The scaffold imports packages its own package.json does not declare, so it cannot ' +
      'install and build. Usually this means a package classified admin-only in ' +
      'cli/generate.mjs (ADMIN_RUNTIME_DEPS) is now imported by code that ships to every ' +
      'project, or a block-only one (BLOCK_RUNTIME_DEPS) is imported outside its block. ' +
      'Either move the import back inside the panel or the block, or reclassify the package ' +
      `as RUNTIME_DEPS.\n${unique.join('\n')}`,
  )
}

// --- pnpm-workspace.yaml --------------------------------------------------------------------------

/**
 * Without `allowBuilds`, pnpm skips esbuild's and lightningcss's build scripts and the site
 * breaks. When the kit's own workspace file is on disk, the output must match it exactly.
 */
function pnpmWorkspaceYaml(kitRoot, deps) {
  const text = `allowBuilds:
  esbuild: true
  lightningcss: true
overrides:
  typescript: ${deps.typescript}
`
  // A root file, not part of the web template, so a plain join rather than `kitPath`.
  const kitFile = join(kitRoot, 'pnpm-workspace.yaml')
  if (existsSync(kitFile)) {
    // The kit's `packages:` key is the only allowed difference: a generated project is one package.
    const kitText = readFileSync(kitFile, 'utf8').replace(/^packages:\n(?:[ \t]+-.*\n)+/m, '')
    if (kitText !== text) {
      throw new Error(
        "The kit's own pnpm-workspace.yaml is no longer what the CLI generates, so generated " +
          'projects would get pnpm settings this repo does not use. That file is not in ' +
          "package.json's `files`, so it cannot simply be read at scaffold time — update " +
          `pnpmWorkspaceYaml in cli/generate.mjs to match.\n` +
          `  kit:       ${JSON.stringify(kitText)}\n` +
          `  generated: ${JSON.stringify(text)}`,
      )
    }
  }
  return text
}

// --- .gitignore -----------------------------------------------------------------------------------

const GITIGNORE = `node_modules
.DS_Store
dist
dist-ssr
*.local
.env
.nitro
.tanstack
.wrangler
.output
.vinxi
__unconfig*

# Build artifacts, but keep the record of what was scaffolded
.kit/*
!.kit/scaffold.json
`

// Git rules for `api/`, appended only when a backend was scaffolded, so the `none` output stays
// the same. The placeholder needs three lines because the bare `dist` rule excludes the
// directory, and a file negation can't reopen it. `api/bin/` and `api/tmp/` are the makefile's
// and air's build output.
const API_GITIGNORE = `
!api/internal/static/dist/
api/internal/static/dist/*
!api/internal/static/dist/.placeholder

# Go build output. \`make build\` writes api/bin/landing-api with the whole site embedded, and
# \`make dev\` runs air, which rebuilds api/tmp/main on every save.
api/bin/
api/tmp/
`

// --- docker-compose.yml ---------------------------------------------------------------------------

/**
 * Templated, not copied, only when a backend is included. The file isn't in `files`, so it doesn't
 * exist under `pnpm dlx`.
 */
function dockerComposeYml() {
  return `services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: landing
    ports:
      # 5433 on the host, not 5432. A developer machine very often already runs Postgres on
      # 5432 (Homebrew, Postgres.app, another project's container), and binding it makes
      # \`docker compose up -d db\` fail on a fresh clone with "port is already allocated". The
      # container's own port stays 5432, so nothing inside the container or in any connection
      # string built from DB_PORT changes shape. Measured on a machine running
      # postgresql@16 locally: 5432 failed to bind, 5433 worked.
      - '5433:5432'
    volumes:
      - landing-db:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d landing']
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  landing-db:
`
}

/** Drift check against the kit's own `docker-compose.yml`, when it is on disk. */
function assertDockerComposeMatchesKit(kitRoot, generated) {
  const kitFile = join(kitRoot, 'docker-compose.yml')
  if (!existsSync(kitFile)) return
  // The kit's `api` service is the one allowed difference: its Dockerfile is built for the kit's
  // layout, and a scaffold gets no Dockerfile yet. Every other line must match.
  const kitText = readFileSync(kitFile, 'utf8').replace(
    /\n {2}api:\n(?:(?: {2,}.*)?\n)*?(?=\nvolumes:)/,
    '',
  )
  if (kitText !== generated) {
    throw new Error(
      "The kit's own docker-compose.yml is no longer what the CLI generates, so a scaffolded " +
        'backend would get compose settings this repo does not use. That file is not in ' +
        "package.json's `files`, so it cannot simply be read at scaffold time — update " +
        `dockerComposeYml in cli/generate.mjs to match.\n` +
        `  kit:       ${JSON.stringify(kitText)}\n` +
        `  generated: ${JSON.stringify(generated)}`,
    )
  }
}

// --- vite.config.ts -------------------------------------------------------------------------------

// No KIT_* branching: a generated project has one config and one implementation per boundary.
function viteConfigTs(answers) {
  // The dev proxy is for `admin` only. The panel calls relative `/api` paths; the proxy gives
  // development the same origin production has, so the refresh cookie is sent. `api` projects post
  // to an absolute `VITE_CONTACT_ENDPOINT` through CORS, so they get no proxy.
  const devProxy =
    (answers.backend ?? 'none') === 'admin'
      ? `  // The panel calls the API with relative paths, so this makes development same-origin the way
  // production already is, where the Go binary serves the site and the API together.
  //
  // Same-origin is what makes \`credentials: 'same-origin'\` enough to send the refresh cookie. It
  // is also why nothing the panel sends is preflighted, why development needs no entry in the
  // API's origin allowlist, and why the panel has no base URL to configure.
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000' },
    },
  },
`
      : ''

  // The panel's prerendered shell, for `admin` only. The Go binary serves this file for every
  // /admin URL; without it a hard load paints the home page. Without the panel the route would
  // 404 and `failOnError` would fail the build.
  const prerenderPages =
    (answers.backend ?? 'none') === 'admin'
      ? `pages: [
        ...enumerateUrls(pages, site).map((u) => ({
          path: u.path,
          prerender: { enabled: true, outputPath: u.outputPath },
        })),
        // Appended here, never added to pages.config.ts. Going through pages.config.ts would put
        // /admin in enumerateUrls, and from there into the sitemap, the nav and the SEO layer,
        // which is the opposite of what a noindex route wants.
        //
        // It is here at all because the Go binary answers every /admin URL by falling back to one
        // file (api/internal/static/static.go). Delete this line and the only file left to fall
        // back to is the prerendered home page, so a hard load of /admin/leads paints the landing
        // hero until hydration replaces it.
        //
        // What lands in the file is the index route's \`pendingComponent\` (PanelSkeleton):
        // src/routes/admin/index.tsx is \`ssr: false\` with no \`component\` at all, so the
        // prerenderer emits the pending frame, which is the skeleton.
        { path: '/admin', prerender: { enabled: true, outputPath: '/admin/index.html' } },
      ],`
      : `pages: enumerateUrls(pages, site).map((u) => ({
        path: u.path,
        prerender: { enabled: true, outputPath: u.outputPath },
      })),`

  return `import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pages } from './src/config/pages.config.ts'
import { site } from './src/config/site.config.ts'
import { enumerateUrls } from './src/lib/pages/enumerate.ts'
import { emitSeoFiles } from './src/lib/seo/emit-plugin.ts'
import { OUT_DIR } from './src/lib/seo/out-dir.ts'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Read by \`src/lib/seo/block-preloads.ts\` at prerender time: dist/client/.vite/manifest.json
  // maps each block's \`variants.ts\` to its built chunk, so the prerendered <head> can
  // modulepreload exactly the chunks a page's blocks need.
  build: { manifest: true },
${devProxy}  resolve: {
    alias: {
      '@/motion': r('./src/integrations/motion.animated.tsx'),
      // Read from the config, not frozen at scaffold time: changing \`theme.mode\` in
      // src/config/site.config.ts switches the site between light, dark and both. Resolved
      // during the build, so a pinned mode still bundles no theme-switching code.
      '@/theme':
        site.theme.mode === 'both'
          ? r('./src/integrations/theme.both.tsx')
          : r('./src/integrations/theme.single.tsx'),
      '@/submit': r('./src/integrations/submit.endpoint.ts'),
      '@/config': r('./src/config'),
      // Must stay LAST: '@' is a catch-all and would shadow the specific aliases above.
      '@': r('./src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      // By default these are found by filename directly under \`src/\`. They live in \`src/app/\`
      // here, so each one must be named. The paths are relative to \`src/\`.
      router: { entry: './app/router.tsx', generatedRouteTree: './app/routeTree.gen.ts' },
      client: { entry: './app/client.tsx' },
      server: { entry: './app/server.ts' },
      prerender: {
        enabled: true,
        // Both false is what keeps /docs (absent from pages.config.ts) out of prerendering —
        // flip either and it prerenders into dist/client with no other warning in the source.
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        concurrency: 8,
      },
      ${prerenderPages}
    }),
    viteReact(),
    emitSeoFiles({ pages, site, outDir: OUT_DIR }),
  ],
})
`
}

/**
 * The span from `opener` to its matching close bracket. `opener` must end in the bracket itself
 * (`'alias: {'`), so depth starts at one.
 */
function matchedSpan(text, opener, file, label) {
  const at = text.indexOf(opener)
  if (at === -1) throw new Error(`${file}: expected to find '${opener}' — ${label}`)
  const open = opener.at(-1)
  const close = open === '{' ? '}' : ']'
  let depth = 0
  for (let i = at; i < text.length; i++) {
    if (text[i] === open) depth++
    else if (text[i] === close && --depth === 0) return text.slice(at, i + 1)
  }
  throw new Error(`${file}: '${opener}' is never closed — ${label}`)
}

/** From the line holding `from` through the line holding `to`, inclusive. */
function lineSpan(text, from, to, file, label) {
  const lines = text.split('\n')
  const start = lines.findIndex((l) => l.includes(from))
  if (start === -1) throw new Error(`${file}: no line contains '${from}' — ${label}`)
  const end = lines.findIndex((l, i) => i >= start && l.includes(to))
  if (end === -1) throw new Error(`${file}: no line contains '${to}' after '${from}' — ${label}`)
  return lines.slice(start, end + 1).join('\n')
}

function oneLine(text, needle, file, label) {
  const line = text.split('\n').find((l) => l.includes(needle))
  if (line === undefined) throw new Error(`${file}: no line contains '${needle}' — ${label}`)
  return line.trim()
}

// --- vite.config.ts, against the kit's own ------------------------------------------------------
// Not text equality: the kit branches on KIT_* flags and a scaffold has one answer baked in. The
// check extracts the parts that must agree from what the CLI emits and requires each, whitespace-
// normalised, in the kit's file. A moved anchor fails on the extraction side.
const VITE_AXES = [
  // The panel's prerendered shell. Without it, a hard load of an admin URL shows the home page.
  ['the /admin prerender entry', (t, f) => oneLine(t, "path: '/admin'", f, 'the panel shell')],
  // The panel's dev-time same origin. Without it no refresh cookie is sent in development.
  ['the /api dev proxy', (t, f) => matchedSpan(t, 'server: {', f, 'the panel dev proxy')],
  // Read by block-preloads.ts at prerender time.
  ['build.manifest', (t, f) => oneLine(t, 'build: { manifest: true }', f, 'the vite manifest')],
  // These keep /docs out of dist, and `failOnError` makes a broken prerender entry fail the build.
  ['the prerender options', (t, f) => matchedSpan(t, 'prerender: {', f, 'prerender settings')],
  // src/app/, not src/. Without these the build looks for src/router.*.
  ['the tanstackStart entries', (t, f) => oneLine(t, 'router: { entry:', f, 'the app entries')],
  // Kept as a runtime branch, because `site.theme.mode` must stay editable after scaffolding.
  ['the @/theme alias', (t, f) => lineSpan(t, "'@/theme':", 'theme.single.tsx', f, 'theme alias')],
  ['the page list', (t, f) => matchedSpan(t, 'enumerateUrls(pages, site).map((u) => ({', f, 'x')],
]

const aliasKeys = (text, file) =>
  [
    ...matchedSpan(text, 'alias: {', file, 'the resolve.alias map').matchAll(/^\s*'([^']+)':/gm),
  ].map((m) => m[1])

const pluginNames = (text, file) =>
  [...matchedSpan(text, 'plugins: [', file, 'the plugin list').matchAll(/^\s*(\w+)\(/gm)].map(
    (m) => m[1],
  )

// Compare what the files do, not their comments or indentation. Whole comment lines only, never a
// trailing `//`, because `'http://localhost:3000'` is one of the compared values.
const flat = (s) => stripCommentLines(s).replace(/\s+/g, ' ').trim()

/** What `viteConfigTs` emits for `admin` must agree with the kit's vite.config.ts, when on disk. */
function assertViteConfigMatchesKit(kitRoot) {
  const rel = 'vite.config.ts'
  const kitCopy = kitPath(kitRoot, rel)
  if (!existsSync(kitCopy)) return
  const kitText = readFileSync(kitCopy, 'utf8')
  const generated = viteConfigTs({ backend: 'admin' })
  const divergences = []

  for (const [label, extract] of VITE_AXES) {
    const fragment = extract(generated, 'cli/generate.mjs viteConfigTs')
    if (!flat(kitText).includes(flat(fragment))) {
      divergences.push(`  ${label}\n    the CLI writes: ${flat(fragment)}`)
    }
  }
  for (const [label, read] of [
    ['resolve.alias keys, in order', aliasKeys],
    ['plugins, in order', pluginNames],
  ]) {
    const mine = read(generated, 'cli/generate.mjs viteConfigTs')
    const theirs = read(kitText, `apps/web/${rel}`)
    if (mine.join(' ') !== theirs.join(' ')) {
      divergences.push(
        `  ${label}\n    the CLI writes: ${mine.join(', ')}\n    the kit has:    ${theirs.join(', ')}`,
      )
    }
  }

  if (divergences.length === 0) return
  throw new Error(
    `apps/web/${rel} and viteConfigTs in cli/generate.mjs have diverged on ${divergences.length} ` +
      'axis/axes. These two are written by hand against each other and this is the only thing ' +
      'that compares them. Exact text equality is NOT required — the kit branches on ' +
      'KIT_ANIMATION, KIT_SUBMIT and KIT_CONFIG and a scaffold does not — but everything below ' +
      `must agree.\n${divergences.join('\n')}`,
  )
}

// --- tsconfig.json --------------------------------------------------------------------------------

function tsconfigJson(answers) {
  return `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "types": ["vite/client", "node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "paths": {
      "@/motion": ["./src/integrations/motion.animated.tsx"],
      "@/theme": ["./src/integrations/${themeFile(answers)}"],
      "@/submit": ["./src/integrations/submit.endpoint.ts"],
      "@/*": ["./src/*"]
    }
  },
  "include": ["src", "scripts", "vite.config.ts"]
}
`
}

const sortedJson = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  )

/**
 * The generated tsconfig must match the kit's, compared by meaning, not text. Expected
 * differences: `paths` values name the chosen boundary files, and `include` drops `configs`. Runs
 * only when the kit's tsconfig is on disk.
 */
function assertTsconfigMatchesKit(kitRoot, generated) {
  const kitFile = kitPath(kitRoot, 'tsconfig.json')
  if (!existsSync(kitFile)) return
  const kit = JSON.parse(readFileSync(kitFile, 'utf8'))
  const mine = JSON.parse(generated)
  const drift = (what, kitValue, myValue) => {
    if (sortedJson(kitValue) === sortedJson(myValue)) return
    throw new Error(
      `The kit's own tsconfig.json ${what} is no longer what the CLI generates, so generated ` +
        'projects would be type-checked under different rules from the kit they came from. ' +
        "tsconfig.json is not in package.json's `files`, so it cannot be read at scaffold time — " +
        `update tsconfigJson in cli/generate.mjs to match.\n` +
        `  kit:       ${sortedJson(kitValue)}\n` +
        `  generated: ${sortedJson(myValue)}`,
    )
  }
  const withoutPaths = ({ paths: _paths, ...rest }) => rest
  drift('compilerOptions', withoutPaths(kit.compilerOptions), withoutPaths(mine.compilerOptions))
  drift(
    'compilerOptions.paths',
    Object.keys(kit.compilerOptions.paths ?? {}).sort(),
    Object.keys(mine.compilerOptions.paths ?? {}).sort(),
  )
  drift(
    'include',
    [...kit.include].filter((entry) => entry !== 'configs').sort(),
    [...mine.include].sort(),
  )
}

// --- the route tree ----------------------------------------------------------------------------
// Templated, not copied: TanStack's route tree imports every route, and a scaffold without the
// panel has no admin routes. Written by hand because the CLI has no bundler;
// `assertRouteTreeMatchesKit` keeps it honest.

/** Every admin-only line of `routeTree.gen.ts`, present or absent as one block per site. */
function routeTreeGen(answers) {
  // Each chunk carries the whitespace that must go with it. Most continue a kept line, so they open
  // with a newline; `AdminRouteChildren` is a whole paragraph and opens and closes with one.
  // The `FileRouteTypes` unions change shape with the panel (prettier wraps past 80 columns), so
  // each is a ternary between two spellings, and the helpers emit their own leading separator.
  const isAdmin = answers.backend === 'admin'
  const adm = (text) => (isAdmin ? text : '')
  // Both drop empty entries. None are empty today, but one would put ` |  | ` into a non-admin
  // scaffold, where the drift check never looks.
  const union = (...entries) => ` ${entries.filter(Boolean).join(' | ')}`
  const wrapped = (...entries) =>
    entries
      .filter(Boolean)
      .map((entry) => `\n    | ${entry}`)
      .join('')

  return `/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './../routes/__root'
import { Route as IndexRouteImport } from './../routes/index'
import { Route as SplatRouteImport } from './../routes/$'${adm(`
import { Route as AdminRouteImport } from './../routes/admin'`)}
import { Route as DocsRouteImport } from './../routes/docs'${adm(`
import { Route as AdminIndexRouteImport } from './../routes/admin/index'
import { Route as AdminAuthedRouteImport } from './../routes/admin/_authed'
import { Route as AdminLoginRouteImport } from './../routes/admin/login'
import { Route as AdminAuthedLeadsRouteImport } from './../routes/admin/_authed/leads'`)}

const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const SplatRoute = SplatRouteImport.update({
  id: '/$',
  path: '/$',
  getParentRoute: () => rootRouteImport,
} as any)${adm(`
const AdminRoute = AdminRouteImport.update({
  id: '/admin',
  path: '/admin',
  getParentRoute: () => rootRouteImport,
} as any)`)}
const DocsRoute = DocsRouteImport.update({
  id: '/docs',
  path: '/docs',
  getParentRoute: () => rootRouteImport,
} as any)${adm(`
const AdminIndexRoute = AdminIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => AdminRoute,
} as any)
const AdminAuthedRoute = AdminAuthedRouteImport.update({
  id: '/_authed',
  getParentRoute: () => AdminRoute,
} as any)
const AdminLoginRoute = AdminLoginRouteImport.update({
  id: '/login',
  path: '/login',
  getParentRoute: () => AdminRoute,
} as any)
const AdminAuthedLeadsRoute = AdminAuthedLeadsRouteImport.update({
  id: '/leads',
  path: '/leads',
  getParentRoute: () => AdminAuthedRoute,
} as any)`)}

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/$': typeof SplatRoute${adm(`
  '/admin': typeof AdminRouteWithChildren`)}
  '/docs': typeof DocsRoute${adm(`
  '/admin/login': typeof AdminLoginRoute
  '/admin/': typeof AdminIndexRoute
  '/admin/leads': typeof AdminAuthedLeadsRoute`)}
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/$': typeof SplatRoute
  '/docs': typeof DocsRoute${adm(`
  '/admin': typeof AdminIndexRoute
  '/admin/login': typeof AdminLoginRoute
  '/admin/leads': typeof AdminAuthedLeadsRoute`)}
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/$': typeof SplatRoute${adm(`
  '/admin': typeof AdminRouteWithChildren`)}
  '/docs': typeof DocsRoute${adm(`
  '/admin/_authed': typeof AdminAuthedRouteWithChildren
  '/admin/login': typeof AdminLoginRoute
  '/admin/': typeof AdminIndexRoute
  '/admin/_authed/leads': typeof AdminAuthedLeadsRoute`)}
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:${
    isAdmin
      ? wrapped(
          "'/'",
          "'/$'",
          "'/admin'",
          "'/docs'",
          "'/admin/login'",
          "'/admin/'",
          "'/admin/leads'",
        )
      : union("'/'", "'/$'", "'/docs'")
  }
  fileRoutesByTo: FileRoutesByTo
  to:${
    isAdmin
      ? union("'/'", "'/$'", "'/docs'", "'/admin'", "'/admin/login'", "'/admin/leads'")
      : union("'/'", "'/$'", "'/docs'")
  }
  id:${
    isAdmin
      ? wrapped(
          "'__root__'",
          "'/'",
          "'/$'",
          "'/admin'",
          "'/docs'",
          "'/admin/_authed'",
          "'/admin/login'",
          "'/admin/'",
          "'/admin/_authed/leads'",
        )
      : union("'__root__'", "'/'", "'/$'", "'/docs'")
  }
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  SplatRoute: typeof SplatRoute${adm(`
  AdminRoute: typeof AdminRouteWithChildren`)}
  DocsRoute: typeof DocsRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/$': {
      id: '/$'
      path: '/$'
      fullPath: '/$'
      preLoaderRoute: typeof SplatRouteImport
      parentRoute: typeof rootRouteImport
    }${adm(`
    '/admin': {
      id: '/admin'
      path: '/admin'
      fullPath: '/admin'
      preLoaderRoute: typeof AdminRouteImport
      parentRoute: typeof rootRouteImport
    }`)}
    '/docs': {
      id: '/docs'
      path: '/docs'
      fullPath: '/docs'
      preLoaderRoute: typeof DocsRouteImport
      parentRoute: typeof rootRouteImport
    }${adm(`
    '/admin/': {
      id: '/admin/'
      path: '/'
      fullPath: '/admin/'
      preLoaderRoute: typeof AdminIndexRouteImport
      parentRoute: typeof AdminRoute
    }
    '/admin/_authed': {
      id: '/admin/_authed'
      path: ''
      fullPath: '/admin'
      preLoaderRoute: typeof AdminAuthedRouteImport
      parentRoute: typeof AdminRoute
    }
    '/admin/login': {
      id: '/admin/login'
      path: '/login'
      fullPath: '/admin/login'
      preLoaderRoute: typeof AdminLoginRouteImport
      parentRoute: typeof AdminRoute
    }
    '/admin/_authed/leads': {
      id: '/admin/_authed/leads'
      path: '/leads'
      fullPath: '/admin/leads'
      preLoaderRoute: typeof AdminAuthedLeadsRouteImport
      parentRoute: typeof AdminAuthedRoute
    }`)}
  }
}
${adm(`
interface AdminAuthedRouteChildren {
  AdminAuthedLeadsRoute: typeof AdminAuthedLeadsRoute
}

const AdminAuthedRouteChildren: AdminAuthedRouteChildren = {
  AdminAuthedLeadsRoute: AdminAuthedLeadsRoute,
}

const AdminAuthedRouteWithChildren = AdminAuthedRoute._addFileChildren(
  AdminAuthedRouteChildren,
)

interface AdminRouteChildren {
  AdminAuthedRoute: typeof AdminAuthedRouteWithChildren
  AdminLoginRoute: typeof AdminLoginRoute
  AdminIndexRoute: typeof AdminIndexRoute
}

const AdminRouteChildren: AdminRouteChildren = {
  AdminAuthedRoute: AdminAuthedRouteWithChildren,
  AdminLoginRoute: AdminLoginRoute,
  AdminIndexRoute: AdminIndexRoute,
}

const AdminRouteWithChildren = AdminRoute._addFileChildren(AdminRouteChildren)
`)}
const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  SplatRoute: SplatRoute,${adm(`
  AdminRoute: AdminRouteWithChildren,`)}
  DocsRoute: DocsRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

import type { getRouter } from './router.tsx'
import type { createStart } from '@tanstack/react-start'
declare module '@tanstack/react-start' {
  interface Register {
    ssr: true
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
`
}

/**
 * This function must reproduce the kit's TanStack-written routeTree.gen.ts exactly, when the kit's
 * copy is on disk. Otherwise a new kit route would be missing from every scaffold.
 */
function assertRouteTreeMatchesKit(kitRoot) {
  const rel = 'src/app/routeTree.gen.ts'
  const kitCopy = kitPath(kitRoot, rel)
  if (!existsSync(kitCopy)) return
  const generated = routeTreeGen({ backend: 'admin' })
  if (readFileSync(kitCopy, 'utf8') !== generated) {
    throw new Error(
      `${rel} in the kit differs from what cli/generate.mjs would write for --backend=admin. ` +
        'TanStack regenerates that file whenever a route is added; update routeTreeGen() to ' +
        'match, or a scaffold gets a route tree that omits the new route with no other signal.',
    )
  }
}

// --- the three block files ------------------------------------------------------------------------

/** Biome's `organizeImports` sorts by module specifier, so emitting in that order lints clean. */
const importOrder = (blocks) => [...blocks].sort()

/**
 * Every block the scaffold will hold: the kit's, then the ones typed at the block question. The
 * three files below must name all of them, or verify-build fails the unregistered folder.
 */
const allBlocks = (answers) => [...answers.blocks, ...(answers.custom ?? [])]

function registryTs(answers) {
  const blocks = allBlocks(answers)
  const imports = importOrder(blocks)
    .map((id) => `import { ${id} } from './${id}/block'`)
    .join('\n')
  const entries = blocks.map((id) => `  ${id},`).join('\n')
  return `import type { BlockManifest } from '@/lib/types'
${imports}

// Only proves each entry *is* a manifest; each is already precisely typed at its own
// definition site. Exists to derive \`BlockId\` below from the real keys.
const manifests = {
${entries}
  // \`schema\` is a property, so TS checks its type contravariantly: \`unknown\` would make every
  // concrete manifest fail this \`satisfies\` check.
  // biome-ignore lint/suspicious/noExplicitAny: unknown breaks assignability here.
} satisfies Record<string, BlockManifest<any, any>>

// Derived from the object keys, not hand-written, so it can't drift from the registry.
export type BlockId = keyof typeof manifests

// A literal, not \`= manifests\`: verify-build.mjs scans the source text for this declaration.
// The explicit \`Record<BlockId, ...>\` widens the \`any\` once, here, instead of at every call
// site that indexes the registry (render-blocks.tsx, json-ld.ts).
// biome-ignore lint/suspicious/noExplicitAny: same reason as above.
export const registry: Record<BlockId, BlockManifest<any, any>> = {
${entries}
}
`
}

// --- block-to-block links ---------------------------------------------------------------------
// Blocks link to each other from their copy (hero and cta point at `contact`, cta at `features`).
// A link to a block you didn't pick throws during prerender, and verify only reports a missing
// <h1>. So the links are read from the copy files and checked here, before anything is written.
/**
 * Every `target: '…'` a block's copy files name, with the file it came from. The only place copy is
 * read for links. Comments are stripped first.
 */
function copyLinkTargets(kitRoot, id) {
  const found = []
  const rel = `src/blocks/${id}/copy.ts`
  const src = readKitFile(kitRoot, rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
  for (const [, target] of src.matchAll(/\btarget:\s*'([^']+)'/g)) found.push({ target, rel })
  return found
}

export function assertBlockLinksResolve(kitRoot, answers) {
  for (const id of answers.blocks) {
    for (const { target, rel } of copyLinkTargets(kitRoot, id)) {
      // Only block ids: no copy targets the `home` page, and a `contact` page exists only with the
      // contact block.
      if (answers.blocks.includes(target)) continue
      throw new Error(
        `Block '${id}' links to '${target}', which is not one of the selected blocks ` +
          `(${answers.blocks.join(', ')}).\n` +
          `  ${rel} has \`target: '${target}'\`\n` +
          '  Block links resolve through src/lib/pages/resolve-link.ts, which throws during ' +
          'server rendering for\n  a target on no page — the page prerenders blank and `pnpm ' +
          'verify` reports "expected exactly 1\n  <h1>, found 0" without ever naming the link.' +
          `\n  Add '${target}' to --blocks, or drop '${id}'.`,
      )
    }
  }
}

// --- the manifests' declaration of those links, reconciled against them --------------------------
// The prompt refuses bad selections using each block's declared `requires.blocks`. That must match
// the copy's real links, or the prompt would offer or refuse the wrong sets. Checked every run.

/** What a block's copy actually requires: its link targets, minus itself. Sorted, deduped. */
function copyBlockDeps(kitRoot, id) {
  const deps = new Set()
  for (const { target } of copyLinkTargets(kitRoot, id)) {
    // A block linking to itself (hero's `secondaryCta`) isn't a dependency.
    if (target !== id) deps.add(target)
  }
  return [...deps].sort()
}

/**
 * What a block's manifest declares in `requires: { blocks: [ … ] }`. Parsed as text with comments
 * stripped, since `block.ts` can't be imported from `.mjs`. No `requires` means no dependencies. A
 * nested object inside `requires` isn't supported and is reported as unparseable.
 */
function manifestBlockDeps(kitRoot, id) {
  const rel = `src/blocks/${id}/block.ts`
  const src = readKitFile(kitRoot, rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  // Unparseable, not `[]`: an empty result would send someone to fix a line that is already right.
  const unparseable = () => {
    if (!/\bblocks:\s*\[/.test(src)) return null
    return new Error(
      `Could not parse \`requires\` on block '${id}' — nested braces are not supported.\n` +
        `  ${rel} declares \`blocks: [...]\`, but this layer reads \`requires\` with a regex that\n` +
        '  stops at the first `}`, so a nested object such as `meta: { … }` inside `requires`\n' +
        '  hides everything after it.\n' +
        '  Fix: keep `requires` flat (`{ blocks: [...] }`), or teach\n' +
        '  `manifestBlockDeps` in cli/generate.mjs to parse nested objects.',
    )
  }

  const requires = src.match(/\brequires:\s*\{([^}]*)\}/)
  if (requires === null) {
    const err = unparseable()
    if (err !== null) throw err
    return []
  }
  const blocks = requires[1].match(/\bblocks:\s*\[([^\]]*)\]/)
  if (blocks === null) {
    const err = unparseable()
    if (err !== null) throw err
    return []
  }
  return [...blocks[1].matchAll(/'([^']+)'/g)].map(([, dep]) => dep).sort()
}

/**
 * `{ [blockId]: string[] }` for every kit block. Throws if a manifest and its copy disagree. Called
 * from `cli/index.mjs` on every path, `--yes` included, because CI only runs `--yes`.
 */
/**
 * `BLOCK_ORDER` is hand-written; `src/blocks/` is the real list. A block missing from the array
 * would never be offered.
 */
function assertBlockOrderMatchesDisk(kitRoot) {
  const onDisk = readdirSync(kitPath(kitRoot, 'src/blocks'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  const declared = [...BLOCK_ORDER].sort()
  if (onDisk.join(',') === declared.join(',')) return
  const missing = onDisk.filter((id) => !BLOCK_ORDER.includes(id))
  const extra = BLOCK_ORDER.filter((id) => !onDisk.includes(id))
  throw new Error(
    `cli/prompts.mjs's BLOCK_ORDER does not match the blocks in src/blocks/.\n` +
      (missing.length
        ? `  on disk but not in BLOCK_ORDER: [${missing.map((d) => `'${d}'`).join(', ')}]\n`
        : '') +
      (extra.length
        ? `  in BLOCK_ORDER but not on disk: [${extra.map((d) => `'${d}'`).join(', ')}]\n`
        : '') +
      '  A block missing from BLOCK_ORDER is never offered and never generated; one listed but\n' +
      '  absent crashes the scaffold. Update BLOCK_ORDER (and BLOCK_VARIANTS and\n' +
      '  BLOCK_DEFAULT_VARIANT beside it) in cli/prompts.mjs.',
  )
}

export function readBlockDeps(kitRoot) {
  assertBlockOrderMatchesDisk(kitRoot)
  const deps = {}
  for (const id of BLOCK_ORDER) {
    const declared = manifestBlockDeps(kitRoot, id)
    const actual = copyBlockDeps(kitRoot, id)
    if (declared.join(',') !== actual.join(',')) {
      throw new Error(
        `Block '${id}' declares different dependencies than its copy actually has.\n` +
          `  src/blocks/${id}/block.ts declares requires.blocks: ` +
          `[${declared.map((d) => `'${d}'`).join(', ')}]\n` +
          `  src/blocks/${id}/copy.ts links to:                    ` +
          `[${actual.map((d) => `'${d}'`).join(', ')}]\n` +
          '  These are two descriptions of one fact and they have drifted. The copy files are the ' +
          'truth —\n  every `target:` in them must resolve to a selected block at render, or the ' +
          'page comes out blank.\n' +
          `  Fix: set requires.blocks on '${id}' to [${actual.map((d) => `'${d}'`).join(', ')}], ` +
          'or change the copy.',
      )
    }
    // The declared array drives the prompt. It equals `actual`; the throw above guarantees that.
    deps[id] = declared
  }
  return deps
}

/**
 * One property per block, wrapped where Biome would wrap it (past 100 columns), so a fresh
 * scaffold lints clean before Biome is installed.
 */
function blockModuleEntry(id) {
  const body = `import('./${id}/variants').then((m) => registerVariants('${id}', m.variants)),`
  const oneLine = `  ${id}: () => ${body}`
  return oneLine.length <= 100 ? oneLine : `  ${id}: () =>\n    ${body}`
}

function blockModulesTs(answers) {
  // The quoted measurement names react-hook-form and zod, which ship only with `contact`.
  const weight = answers.blocks.includes('contact')
    ? "since that's the weight (contact alone: 99 KB raw / 30 KB gzip of\n * react-hook-form + zod). Loading registers components into `variant-registry.ts` so\n * `RenderBlocks` can read them back synchronously."
    : "since that's where the weight is. Loading registers components\n * into `variant-registry.ts` so `RenderBlocks` can read them back synchronously."
  const entries = allBlocks(answers).map(blockModuleEntry).join('\n')
  return `import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Dynamic import per block, keyed by id — one chunk each. \`registry.ts\` imports manifests
 * eagerly (copy/nav/schema are needed synchronously for the head and JSON-LD); only components
 * are deferred here, ${weight}
 */
export const blockModules: Record<BlockId, () => Promise<unknown>> = {
${entries}
}
`
}

function variantsAllTs(answers) {
  const blocks = allBlocks(answers)
  // All relative imports sorted together, `./registry` included.
  const imports = [
    ['./registry', `import type { BlockId } from './registry'`],
    ['./variant-registry', `import { registerVariants } from './variant-registry'`],
    ...blocks.map((id) => [
      `./${id}/variants`,
      `import { variants as ${id} } from './${id}/variants'`,
    ]),
  ]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, line]) => line)
    .join('\n')
  const entries = blocks.map((id) => `  ${id},`).join('\n')
  return `${imports}

/**
 * Server-only. The prerenderer runs in one process and needs every block at once, so it can't
 * use the per-page dynamic import \`src/app/client.tsx\` uses. Keep this file unreachable from
 * \`src/app/client.tsx\`, or every component lands back in the client bundle.
 *
 * \`Record<BlockId, …>\` makes a missing block a compile error. Plain \`registerVariants(…)\` calls
 * would not: leaving one out still compiles and lints, and only fails as a 500 when \`/docs\`
 * renders it.
 */
const all: Record<BlockId, Parameters<typeof registerVariants>[1]> = {
${entries}
}

for (const [id, variants] of Object.entries(all)) registerVariants(id as BlockId, variants)
`
}

// --- src/config/pages.config.ts ---------------------------------------------------------------------

function blocksProperty(ids) {
  // Always bare (`'hero'`): each block ships only its chosen layout, which is its `defaultVariant`.
  const refs = ids.map((id) => `'${id}'`)
  const oneLine = `    blocks: [${refs.join(', ')}],`
  // Same reason as blockModuleEntry: match Biome's wrapping so a fresh scaffold lints clean.
  if (oneLine.length <= 100) return oneLine
  return ['    blocks: [', ...refs.map((ref) => `      ${ref},`), '    ],'].join('\n')
}

function pageLiteral(seoId, pageId, path, ids) {
  const seo = PAGE_SEO[seoId]
  return [
    '  {',
    `    id: '${pageId}',`,
    `    path: '${path}',`,
    blocksProperty(ids),
    '    seo: {',
    `      mn: { title: '${seo.mn.title}', description: '${seo.mn.description}' },`,
    `      en: { title: '${seo.en.title}', description: '${seo.en.description}' },`,
    '    },',
    '  },',
  ].join('\n')
}

/**
 * The kit's `pages.config.ts` ships in the tarball, so this check runs everywhere. It catches kit
 * SEO copy that changed without the CLI.
 */
function assertSeoCopyMatchesKit(kitRoot) {
  const kitText = readKitFile(kitRoot, 'src/config/pages.config.ts')
  for (const [pageId, locales] of Object.entries(PAGE_SEO)) {
    for (const copy of Object.values(locales)) {
      for (const text of [copy.title, copy.description]) {
        if (!kitText.includes(`'${text}'`)) {
          throw new Error(
            `Kit src/config/pages.config.ts no longer contains the '${pageId}' SEO string ` +
              `'${text}', which cli/generate.mjs writes into every scaffold. Update PAGE_SEO in ` +
              "cli/generate.mjs, or generated projects keep the kit's old wording forever",
          )
        }
      }
    }
  }
}

function pagesConfigTs(answers) {
  const hasContact = answers.blocks.includes('contact')
  // Your own blocks go on the home page, after the kit's. Otherwise they'd exist but not show.
  const home = answers.pages === 'multi' ? allBlocks(answers).filter((id) => id !== 'contact') : []
  const literals = []

  // Multi-page moves contact to its own route, unless contact is the only block: then `/` would be
  // empty and fail verify.
  if (answers.pages === 'multi' && hasContact && home.length > 0) {
    literals.push(pageLiteral('home', 'home', '/', home))
    literals.push(pageLiteral('contact', 'contact', '/contact', ['contact']))
  } else if (answers.pages === 'multi' && !hasContact) {
    literals.push(pageLiteral('home', 'home', '/', home))
  } else {
    literals.push(pageLiteral('home', 'home', '/', allBlocks(answers)))
  }

  return `import type { BlockId } from '@/blocks/registry'
import type { PageConfig } from '@/lib/types'

export const pages: PageConfig<BlockId>[] = [
${literals.join('\n')}
]
`
}

// --- src/config/site.config.ts ------------------------------------------------------------------------

/**
 * Which selected blocks may appear in `nav`, read from each block's manifest. A wrong nav target
 * throws at render, and a block with no `nav` key shows its raw id. Comments are stripped first.
 */
function navTargets(kitRoot, answers) {
  return answers.blocks.filter((id) => {
    const src = readKitFile(kitRoot, `src/blocks/${id}/block.ts`)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    return /\bnav:\s*\{/.test(src)
  })
}

function siteConfigTs(kitRoot, answers) {
  const targets = navTargets(kitRoot, answers)
  const nav = targets.map((id) => `{ target: '${id}' }`).join(', ')
  const theme = `{ mode: '${answers.theme}' }`
  return `import type { SiteConfig } from '@/lib/types'

// Annotated \`: SiteConfig\`, not \`satisfies SiteConfig\`. \`satisfies\` narrows every value here to
// the literal that was written, so \`mode: 'light'\` stops being \`'light' | 'dark' | 'both'\` and any
// \`site.theme.mode === 'both'\` check becomes a TS2367 "no overlap" error rather than a comparison.
export const site: SiteConfig = {
  name: 'Your Company',
  // Replace this before you ship. \`pnpm verify\` fails while it is still here, on purpose: every
  // canonical URL, hreflang tag and sitemap entry is built from it, and a wrong one is invisible
  // on the page while ranking the site as a duplicate of a domain nobody owns.
  url: '${URL_PLACEHOLDER}',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  ogImageDefault: '/og-default.jpg',
  organization: {
    kind: 'Organization',
    legalName: 'Your Company LLC',
    logo: '/logo.svg',
    email: 'hello@your-domain.example',
    phone: '+976 0000 0000',
    address: { country: 'MN', city: 'Ulaanbaatar', street: 'Street address', postalCode: '00000' },
  },
  nav: [${nav}],
  // \`both\` gives light, dark and a toggle. Change it to \`'dark'\` or \`'light'\` to pin the
  // site to one palette, which also drops the toggle and all theme-switching JavaScript.
  theme: ${theme},
}
`
}

// --- .kit/scaffold.json ---------------------------------------------------------------------------

// A record of what was generated, not current state. Hand-added blocks make it stale, and that's
// fine.
const scaffoldJson = (answers, kitVersion) =>
  json({ kitVersion, generatedAt: new Date().toISOString(), answers })

// --- workspace registration -------------------------------------------------------------------------

/** `- './frontend/'`, `- "frontend"` and `- frontend` are the same entry. */
function normalizeEntry(raw) {
  const value = raw
    .trim()
    .replace(/\s+#.*$/, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '')
  return value
}

/**
 * The only write outside the target directory. Only touches the target's parent
 * `pnpm-workspace.yaml`, and only if it has a `packages:` key. Appends one entry and never
 * rewrites the file, so an inline `packages: [a, b]` is reported instead.
 */
export function registerInWorkspace(outDir) {
  const file = join(dirname(outDir), 'pnpm-workspace.yaml')
  if (!existsSync(file)) return { status: 'no-file', message: null }

  const name = basename(outDir)
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const keyAt = lines.findIndex((line) => /^\s*packages:/.test(line))
  if (keyAt === -1) return { status: 'not-a-workspace', message: null }

  const inline = lines[keyAt].slice(lines[keyAt].indexOf('packages:') + 'packages:'.length).trim()
  if (inline !== '' && !inline.startsWith('#')) {
    return {
      status: 'inline',
      message:
        `! ${file} lists packages inline (${inline}) — add '${name}' to it by hand. ` +
        'Rewriting a flow sequence would reformat a file this tool only ever appends to.',
    }
  }

  // The list under the key: blank lines and comments are skipped; anything else ends it.
  const entries = []
  let indent = null
  let lastEntryAt = -1
  for (let i = keyAt + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const match = line.match(/^(\s*)-\s*(.*)$/)
    if (!match) break
    indent = match[1]
    lastEntryAt = i
    entries.push(normalizeEntry(match[2]))
  }

  // `*` already covers the new folder, so appending would change nothing.
  if (entries.includes(name) || entries.includes('*')) {
    return { status: 'already', message: `✓ '${name}' is already listed in pnpm-workspace.yaml` }
  }

  lines.splice(lastEntryAt === -1 ? keyAt + 1 : lastEntryAt + 1, 0, `${indent ?? '  '}- ${name}`)
  writeFileSync(file, lines.join('\n'))
  return { status: 'added', message: `✓ Registered ${name} in pnpm-workspace.yaml` }
}

// --- the generator ----------------------------------------------------------------------------------

/** The kit's own version, stamped into `.kit/scaffold.json`. */
export function readKitVersion(kitRoot) {
  return kitManifest(kitRoot).version
}

/**
 * Writes every file a scaffold can't inherit into `outDir`, after the copy layer. Every drift check
 * runs before the first write.
 *
 * @returns every path written, relative to `outDir`.
 */
export function generateFiles(kitRoot, outDir, answers, kitVersion) {
  const manifest = kitManifest(kitRoot)
  assertSeoCopyMatchesKit(kitRoot)

  const tsconfig = tsconfigJson(answers)
  assertTsconfigMatchesKit(kitRoot, tsconfig)
  assertRouteTreeMatchesKit(kitRoot)
  assertViteConfigMatchesKit(kitRoot)

  // `?? 'none'` covers callers that build `answers` by hand.
  const hasBackend = (answers.backend ?? 'none') !== 'none'
  const dockerCompose = hasBackend ? dockerComposeYml() : null
  if (hasBackend) assertDockerComposeMatchesKit(kitRoot, dockerCompose)

  const packageJsonText = packageJson(outDir, answers, manifest)
  const files = [
    ['package.json', packageJsonText],
    ['pnpm-workspace.yaml', pnpmWorkspaceYaml(kitRoot, manifest.deps)],
    ['.gitignore', hasBackend ? GITIGNORE + API_GITIGNORE : GITIGNORE],
    ['vite.config.ts', viteConfigTs(answers)],
    ['tsconfig.json', tsconfig],
    ['src/app/routeTree.gen.ts', routeTreeGen(answers)],
    ['src/blocks/registry.ts', registryTs(answers)],
    ['src/blocks/block-modules.ts', blockModulesTs(answers)],
    ['src/blocks/variants.all.ts', variantsAllTs(answers)],
    ['src/config/pages.config.ts', pagesConfigTs(answers)],
    ['src/config/site.config.ts', siteConfigTs(kitRoot, answers)],
    ['.kit/scaffold.json', scaffoldJson(answers, kitVersion)],
  ]

  // At the project root, not under `api/`: it runs Postgres for the whole project.
  if (hasBackend) files.push(['docker-compose.yml', dockerCompose])

  // Your own blocks, from the same templates `add-block` uses.
  for (const id of answers.custom ?? []) {
    for (const [name, body] of Object.entries(blockFiles(id, [CUSTOM_VARIANT]))) {
      files.push([`src/blocks/${id}/${name}`, body])
    }
  }

  const written = []
  for (const [rel, text] of files) writeOut(outDir, rel, text, written)

  // Last, and after the writes: only the finished project shows what it imports. A failure still
  // rolls back, because `cli/index.mjs` wraps this call.
  assertShippedImportsAreDeclared(outDir, packageJsonText)
  return written
}
