// The generate layer: the files a scaffold cannot inherit, written fresh from the answers.
//
// Everything here is a string template plus the `Answers` object. Nothing is copied — that is
// the copy layer's job, and the two lists never overlap. `src/config/`, `registry.ts`,
// `block-modules.ts` and `variants.all.ts` are left out of every COPY_* list on purpose, so this
// file can write them.
//
// `tsconfig.json` and `pnpm-workspace.yaml` are templated here because they have to be: neither
// is in `package.json`'s `files`, so under `pnpm dlx` they are not on disk at all. Reading them
// at runtime would work in this repo and fail on every real install. Both carry a drift check
// that runs only when the kit's own copy IS present — a working copy, which is exactly where
// someone would edit them — so changing one and not the other stops the CLI here.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { blockFiles } from './add.mjs'
import { kitPath } from './kit-manifest.mjs'
import { BLOCK_DEFAULT_VARIANT, BLOCK_ORDER, CUSTOM_VARIANT } from './prompts.mjs'

// --- the dependency split ----------------------------------------------------------------------
//
// The kit keeps every package in `devDependencies` (Task 1): it is a generator that ships no
// runtime, so nothing it depends on should be downloaded by a `pnpm dlx` that only copies files.
// A generated project is an app and wants the ordinary split, which is the exact opposite. So the
// versions come from the kit's manifest — one source of truth, no drift — and the *grouping* comes
// from the lists below.
//
// Every name in every list must exist in the kit's manifest, and every name in the kit's
// manifest must appear in one of them. Both directions matter and they catch different mistakes: a
// rename upstream would silently drop a dependency from every generated project, and a package
// ADDED to the kit would silently never reach one. Neither has any other signal.

/** Shipped to the browser or imported by app code at runtime. */
const RUNTIME_DEPS = [
  '@fontsource-variable/inter',
  '@fontsource-variable/manrope',
  '@tanstack/react-router',
  '@tanstack/react-start',
  'motion',
  'react',
  'react-dom',
  // `src/integrations/submit-schema.ts` imports zod and is always copied, so this is never
  // optional.
  'zod',
]

/** Runtime, but only when the block that needs it was selected. */
const BLOCK_RUNTIME_DEPS = { contact: ['react-hook-form'] }

/**
 * Runtime, but only when the admin panel was asked for.
 *
 * A flat list rather than BLOCK_RUNTIME_DEPS's object, because there is one panel and not one
 * entry per block, but it exists for the same reason: a project that answered `none` or `api`
 * has no panel, so shipping it Radix and TanStack Table would be a dozen-odd packages it can
 * never import. The CLASSIFIED check below is what keeps this list honest in both directions — a
 * package added to apps/web and left out of here fails the CLI, and one named here but renamed
 * upstream fails it too.
 *
 * `react-hook-form` is deliberately in both this list and BLOCK_RUNTIME_DEPS.contact, so how many
 * packages the panel actually adds depends on whether the contact block was picked too. The
 * panel's login form needs it either way, and `pickDeps` builds an object, so naming it twice is
 * harmless.
 */
const ADMIN_RUNTIME_DEPS = [
  '@hookform/resolvers',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label',
  '@radix-ui/react-separator',
  '@radix-ui/react-slot',
  '@tanstack/react-table',
  'class-variance-authority',
  'clsx',
  'lucide-react',
  'react-hook-form',
  'sonner',
  'tailwind-merge',
  // The `animate-in` / `zoom-in-95` / `slide-in-from-*` utilities `sheet.tsx` and
  // `dropdown-menu.tsx` are written against. Tailwind v4 dropped them and nothing else here
  // defines them, so without this the sheet and the dropdown appear and vanish with no
  // transition and no error.
  //
  // Imported from `src/styles/theme.css`, which ships to EVERY project — so unlike the rest of
  // this list, the gate is not "the file is never copied". `transformThemeCss` in cli/copy.mjs
  // removes the `@import` and the comment paragraph above it for any answer but `admin`, and that
  // removal and this entry have to move together: a project that kept the import and lost the
  // package fails its build on a missing module.
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

// Lighthouse is deliberately not shipped to generated projects (spec §2: too slow, developers
// would delete it). Listed rather than merely omitted so the completeness check below still
// accounts for it — an unclassified package is an error, and silence is not a classification.
const EXCLUDED_DEPS = ['@lhci/cli']

const CLASSIFIED = [
  ...RUNTIME_DEPS,
  ...Object.values(BLOCK_RUNTIME_DEPS).flat(),
  ...ADMIN_RUNTIME_DEPS,
  ...BUILD_DEPS,
  ...EXCLUDED_DEPS,
]

// --- SEO copy ------------------------------------------------------------------------------------
//
// The kit's own wording, reused verbatim so a scaffold reads like the kit's demo rather than like
// lorem ipsum. Held here rather than parsed out of the kit's `pages.config.ts` — parsing TS text
// for string literals is the kind of fragile reach this project keeps replacing with real parsers —
// but checked against that file at generate time by `assertSeoCopyMatchesKit`, so the two cannot
// drift apart quietly.
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
//
// `biome ci .` is the generated project's `pnpm lint` and the first gate of its `pnpm verify`,
// and it formats every `.json` file written here. `JSON.stringify(…, null, 2)` always puts each
// array element on its own line, while Biome collapses any array or object that fits in 100
// columns. They disagree, and the disagreement is a lint error.
//
// This was seen, not guessed: the first `pnpm verify` on a fresh scaffold failed on
// `.kit/scaffold.json`, because `"blocks"` held four short strings on four lines. That file is
// linted because a fresh scaffold has no `.git` for Biome's `useIgnoreFile` to read, and the
// generated `.gitignore` un-ignores `scaffold.json` anyway, so it stays linted after `git init`.
//
// Objects would be safe either way, since Biome keeps an object the author expanded. The same
// fits-or-expands rule is used for both so the output has one shape and no special cases.
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
  // A scalar has nothing to expand. Checked before the branches below and not after, because
  // `Object.entries('pnpm lint && …')` is a list of that string's CHARACTERS and expands happily
  // into one JSON property per letter — which is exactly what the over-long `verify` script did
  // here before this line existed. Nothing about the output looked like an error; it was valid
  // JSON, and only reading it caught it.
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
  // The version is the ROOT package's: that is what npm publishes and what `.kit/scaffold.json`
  // records. `readKitFile` would look under WEB_ROOT and find the private web package, whose
  // version nobody outside this repo ever sees.
  const rootPkg = JSON.parse(readFileSync(join(kitRoot, 'package.json'), 'utf8'))
  if (typeof rootPkg.version !== 'string' || rootPkg.version === '') {
    throw new Error(
      "Kit package.json has no 'version' — `.kit/scaffold.json` records which kit version " +
        'generated a project, and a scaffold that cannot say so is not worth writing',
    )
  }
  // The dependency ranges are the web template's, and only the web template's. The root package
  // depends on Biome to lint `cli/`, which no generated project needs and which would fail the
  // CLASSIFIED check below if it were mixed in here.
  const pkg = JSON.parse(readKitFile(kitRoot, 'package.json'))
  // Both groups, because which group the kit uses is Task 1's business and could change again;
  // what this layer needs is the version range, whichever side it is filed under.
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
          'as runtime, block-only runtime, admin-only runtime, build or excluded. Add it to ' +
          'RUNTIME_DEPS, BLOCK_RUNTIME_DEPS, ADMIN_RUNTIME_DEPS, BUILD_DEPS or EXCLUDED_DEPS ' +
          '— otherwise every generated project silently goes without it',
      )
    }
  }
  return { version: rootPkg.version, deps }
}

/**
 * `basename` is the developer's directory name, and npm's rules for a package name are narrower
 * than a directory's: uppercase letters and spaces are both legal in a path and both rejected by
 * `pnpm install`. Normalised rather than passed through, so `landing-kit "Client Site"` scaffolds
 * and installs instead of scaffolding and then failing at the first install.
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

// The package manager a generated project declares. Kept beside the generated package.json rather
// than read from the kit's own, because the kit's version is what BUILDS the kit and this is what a
// scaffolded project is told to USE. They move together today and need not always.
const PACKAGE_MANAGER = 'pnpm@12.4.2'

function packageJson(outDir, answers, { deps }) {
  const runtime = [...RUNTIME_DEPS]
  for (const [block, extra] of Object.entries(BLOCK_RUNTIME_DEPS)) {
    if (answers.blocks.includes(block)) runtime.push(...extra)
  }
  const hasAdmin = answers.backend === 'admin'
  if (hasAdmin) runtime.push(...ADMIN_RUNTIME_DEPS)
  const hasBackend = (answers.backend ?? 'none') !== 'none'
  // Chains the binaries directly rather than `pnpm lint && pnpm typecheck && …`. Naming the
  // package manager here would hard-require pnpm: `npm run verify` would die on
  // `pnpm: command not found`, which is a miserable first experience for anyone who installed
  // with npm. Every package manager puts `node_modules/.bin` on PATH for a script, so this
  // form works under all three. The Go steps are appended the same way, not via the `api:*`
  // script names below — `cd api` is the last thing this chain does, and nothing runs after it,
  // so there is nothing to `cd` back to.
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
    // Pinned on request, and it is a harder pin than the `verify` comment below assumes: corepack
    // enforces this field, so a generated project now wants pnpm specifically. The scripts stay
    // package-manager-neutral anyway, because the two decisions are separable and someone who
    // deletes this line should get a project that still works under npm.
    packageManager: PACKAGE_MANAGER,
    scripts: {
      dev: 'vite dev',
      build: 'vite build',
      typecheck: 'tsc --noEmit',
      lint: 'biome ci .',
      fix: 'biome check --write .',
      conventions: 'node scripts/check-conventions.mjs',
      verify,
      // Runnable on their own, matching the kit's own script names and bodies (apps/api's path
      // becomes `api`, not `apps/api`, since a generated project is flat). Not referenced from
      // `verify` above by name — see the comment there for why.
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
//
// The CLASSIFIED loops above prove every package is FILED somewhere. They do not prove a filing is
// TRUE. `lucide-react` is filed admin-only; nothing stopped `src/components/header.tsx` from
// importing it, and a `--backend=none` scaffold then shipped source importing a package its own
// `package.json` does not list — no CLI error, and a snapshot line reading `changed
// src/components/header.tsx` like any ordinary edit.
//
// So: read what actually shipped. Walk the finished target, collect every bare module specifier,
// and reconcile against the `package.json` this run just wrote. It runs per answer set, which is
// the only level at which the question has an answer — `lucide-react` in `src/admin` is correct
// and `lucide-react` in `src/components` is a broken `none` project, and the difference is which
// files the answer put on disk.
//
// This subsumes the admin-only case rather than special-casing it. An undeclared package is an
// undeclared package whichever list it came from, so BLOCK_RUNTIME_DEPS is covered by the same
// walk with no extra code.

// Names Node resolves without a `package.json` entry. `node:`-prefixed specifiers are handled
// separately; these are the bare spellings (`fs`, `path`) that `scripts/*.mjs` could still use.
const BUILTIN_MODULES = new Set(builtinModules)

// Comment-only lines, dropped before the patterns below run. A JSDoc line quoting an import is
// not an import, and this kit's prose quotes them often — `src/admin/lib/utils.ts` explains that
// shadcn now writes `import { cn } from 'cn'`, and a scan that believed it failed every admin
// scaffold on a package nobody depends on. Line-shaped rather than a real comment parser: no
// import statement ever starts with any of these three, so nothing real is lost.
const COMMENT_LINE = /^[ \t]*(?:\/\/|\/?\*)/
const stripCommentLines = (text) =>
  text
    .split('\n')
    .filter((l) => !COMMENT_LINE.test(l))
    .join('\n')

// Static `from '…'`, bare `import '…'`, dynamic `import('…')` and `require('…')`. Deliberately
// regex and not a parser: no new dependency, and a false POSITIVE here is a loud failure someone
// reads, while the alternative — shipping nothing — is the silence this exists to end.
//
// The first is anchored at the start of a line and forbids a quote before `from`, so it spans a
// multi-line import clause (`import {\n  a,\n} from 'x'`) and cannot run past the end of one
// statement into the next one's specifier.
const JS_SPECIFIERS = [
  /^[ \t]*(?:import|export)[ \t][^'"\n]*(?:\n[^'"\n]*)*?\bfrom[ \t]*['"]([^'"\n]+)['"]/gm,
  /^[ \t]*import[ \t]*['"]([^'"\n]+)['"]/gm,
  /\bimport[ \t]*\([ \t]*['"]([^'"\n]+)['"]/g,
  /\brequire[ \t]*\([ \t]*['"]([^'"\n]+)['"]/g,
]

// `@import "tw-animate-css";` is a real dependency edge and the exact one the panel added to a
// file that ships to EVERY project (`transformThemeCss` is what removes it for `none` and `api`).
// A CSS-only check would have caught that coupling breaking in the direction the JS scan cannot
// see, so the two run together.
const CSS_SPECIFIERS = [/@import\s+['"]([^'"\n]+)['"]/g]

const SCANNED = { js: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'], css: ['.css'] }

/**
 * The npm package a specifier names, or null when it names no package at all.
 *
 * `@/…` is this project's own source alias and is NOT a scope, which is the one case worth
 * spelling out: `@/admin/lib/api` and `@radix-ui/react-dialog` are the same shape and only one is
 * a package. Subpaths collapse to their package, so `lucide-react/icons/x` is `lucide-react` and
 * `@fontsource-variable/inter/wght.css` is `@fontsource-variable/inter`.
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
 * Every package the shipped source imports must be in the shipped `package.json`.
 *
 * Runs on the finished target rather than on the kit, because the question is about one answer
 * set: the kit's own tree always contains the panel and always declares its packages, which is
 * precisely why the kit's `pnpm verify` stayed green while a `none` scaffold was broken.
 *
 * The `api/` tree is walked too and costs nothing — Go files match no extension here — so a `.ts`
 * or `.css` ever added under it is covered without this function learning about the backend.
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
  // Sorted and de-duplicated: one package imported by six files is one mistake, and a list that
  // repeats it six times reads like six.
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
 * `allowBuilds` is not optional decoration: without it pnpm 10 silently skips esbuild's and
 * lightningcss's build scripts, and the site breaks in a way that names neither package.
 *
 * The `typescript` version comes from the kit's `package.json` rather than from its
 * `pnpm-workspace.yaml`, because that file is not in `package.json`'s `files` and therefore does
 * not exist under `pnpm dlx`. The assertion below closes the gap that creates: when the kit's own
 * copy IS on disk, what this function produces must equal it byte for byte.
 */
function pnpmWorkspaceYaml(kitRoot, deps) {
  const text = `allowBuilds:
  esbuild: true
  lightningcss: true
overrides:
  typescript: ${deps.typescript}
`
  // The kit's workspace file is a root file, not part of the web template, so this is a direct
  // join rather than `kitPath`. There is one workspace per repository by definition.
  const kitFile = join(kitRoot, 'pnpm-workspace.yaml')
  if (existsSync(kitFile)) {
    // The kit declares `packages:` because it holds two workspace packages; a generated project
    // holds one and declares none. That is the only difference allowed. Everything below it,
    // the pnpm settings a generated project inherits, must still match exactly, so the key is
    // stripped rather than the comparison loosened.
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

// The git rules the generated \`api/\` tree needs, appended only when a backend was scaffolded
// (api/ does not otherwise exist) and never spliced into GITIGNORE unconditionally: the four
// --backend=none snapshot variants must see byte-identical output to before, and an unconditional
// append would move every one of them for rules that name paths none of them have.
//
// Both halves exist because the kit's own .gitignore needed the same rule and fixing it only there
// pushes the failure one level out, into every project this kit generates. That distance is the
// argument, not a detail of it. A maintainer of THIS repo knows why a stray binary appeared; the
// client's team is whoever the kit was handed to, running \`make build\` on day one and \`git add -A\`
// after it.
//
// The placeholder negation is three lines, not the two it looks like it should need, for the
// identical reason as this kit's own .gitignore (see there): the bare \`dist\` rule three lines up
// already excludes that directory outright, and a directory excluded that way cannot be reopened
// by a file-level negation below it. Without it a scaffolded project's OWN \`git init\` never tracks
// its placeholder, and a fresh clone of THAT project hits the \`go:embed\` failure Task 1 exists to
// prevent.
//
// \`api/bin/\` and \`api/tmp/\` are the two binaries the makefile writes, and both \`makefile\` and
// \`.air.toml\` ship (API_COPY_FILES in cli/kit-manifest.mjs). \`make build\` writes
// api/bin/landing-api, 34 MB with the whole site embedded. \`make dev\` runs air, whose tmp_dir is
// \`tmp\`, so every save rebuilds api/tmp/main. The bare \`dist\` rule covers neither.
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
 * Templated rather than copied, only when a backend is included: `docker-compose.yml` is a root
 * file that belongs to neither template tree (`WEB_ROOT` nor the API tree in `kit-manifest.mjs`),
 * and it is not in `package.json`'s `files`, so it does not exist on disk at all under `pnpm dlx`.
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

/**
 * Same reason and same shape as `pnpmWorkspaceYaml`'s and `tsconfigJson`'s drift checks: the kit's
 * own `docker-compose.yml` is not readable at scaffold time (it is not in `files`), so this is the
 * one place a change to it can be caught — and only when the kit's own copy IS on disk, which is
 * every working copy, which is exactly where someone would edit it.
 */
function assertDockerComposeMatchesKit(kitRoot, generated) {
  const kitFile = join(kitRoot, 'docker-compose.yml')
  if (!existsSync(kitFile)) return
  // The kit's file declares an `api` service and a generated project's does not. That is the one
  // difference allowed, and it is not cosmetic: the kit has a Dockerfile at its root built for its
  // own apps/web plus apps/api shape, and a scaffolded project is a flat web app with the service
  // in `api/`, so that Dockerfile does not apply and the CLI does not yet generate one. Shipping a
  // compose file that referenced a Dockerfile the scaffold never receives would look complete and
  // fail on `docker compose up`, so the service is omitted until there is one to point at.
  //
  // Stripped rather than the comparison loosened, so every OTHER line, which is the database
  // configuration a scaffold really does inherit, still has to match exactly.
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

// No KIT_* branching and no `configs/` import: a generated project has exactly one config and one
// implementation per boundary, so every branch the kit's own vite.config.ts carries has already
// been decided by the answers. The comments that survive are the ones explaining a decision the
// code cannot explain itself.
function viteConfigTs(answers) {
  // The dev proxy is gated on `admin`, not on "has a backend". The panel's API client calls
  // relative paths (`/api/...`), and in production the Go binary serves the site and the API
  // together, so those paths resolve. Development has no such server, and the proxy is what
  // gives it the same origin: `credentials: 'same-origin'` is then enough to send the refresh
  // cookie, nothing is preflighted, and there is no allowlist entry or base URL to keep in sync.
  //
  // `--backend=api` deliberately gets no proxy. That project's contact form posts to an absolute
  // `VITE_CONTACT_ENDPOINT` (src/integrations/submit.endpoint.ts) and reaches Fiber through CORS,
  // which already works. Adding a proxy would silently change what a relative value in that
  // variable means for someone who has already set one. The omission is a decision, not an
  // oversight.
  //
  // `?? 'none'` for the same reason as the rest of this file: belt-and-braces for a caller that
  // builds `answers` by hand rather than through `resolveAnswers`.
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

  // The panel's prerendered shell, gated on the same answer as the proxy. The Go binary answers
  // every /admin URL by falling back to one file (internal/static/static.go), and without this
  // entry the only file there is the prerendered home page, so a hard load of an admin URL paints
  // the hero until hydration replaces it.
  //
  // A project that declined the panel has no /admin route, and the entry cannot simply be emitted
  // unconditionally and left to do nothing: `src/routes/$.tsx` answers an unrouted path with a
  // 404, and the prerenderer treats that status as an error. Measured on the kit itself by adding
  // a `/nope` entry — `Failed to fetch /nope: Not Found`, and `failOnError: true` (three lines
  // above in the emitted file) turns it into a build that exits 1.
  //
  // The non-admin branch is byte-identical to what this function emitted before the panel existed,
  // deliberately: the five non-admin scaffold snapshots are what prove no admin content reaches a
  // project that declined it, and reformatting them for a branch they never take would spend that
  // signal on noise.
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
 * The span starting at `opener` and ending at its matching close bracket.
 *
 * `opener` must end in the bracket itself (`'alias: {'`, `'plugins: ['`), so depth starts at one
 * and the first unmatched close ends the span.
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
//
// The last generated file with a hand-maintained twin and no drift assertion. Every other one has
// a check — `assertTsconfigMatchesKit`, `pnpmWorkspaceYaml`'s byte comparison,
// `assertDockerComposeMatchesKit`, `assertRouteTreeMatchesKit`, `assertSeoCopyMatchesKit` — and
// this is the file that decides whether the panel shell is prerendered at all. Before this, the
// `/admin` prerender entry and the `/api` dev proxy were proven by a re-recordable snapshot hash
// and by a client's own build, and by nothing else.
//
// NOT text equality, deliberately. The two files legitimately differ: the kit branches on
// `KIT_ANIMATION`, `KIT_SUBMIT` and `KIT_CONFIG` and a generated project has one answer baked in,
// so `@/motion`, `@/submit`, `@/config` and the `pages`/`site` imports are different on purpose.
// A check demanding equality there would fail on every scaffold and be switched off within a week.
// What is asserted instead is the set of axes on which the two MUST agree — each extracted from
// what the CLI emits, then required verbatim (whitespace-normalised) in the kit's file. An axis
// whose anchor has moved fails on the extraction side, so the list cannot rot quietly either.
const VITE_AXES = [
  // The panel's prerendered shell. Drop this and the Go binary's /admin fallback serves the
  // prerendered HOME page, so a hard load of an admin URL paints the marketing hero.
  ['the /admin prerender entry', (t, f) => oneLine(t, "path: '/admin'", f, 'the panel shell')],
  // The panel's dev-time same-origin. Without it `credentials: 'same-origin'` sends no refresh
  // cookie and every panel request in development is cross-origin.
  ['the /api dev proxy', (t, f) => matchedSpan(t, 'server: {', f, 'the panel dev proxy')],
  // Read by block-preloads.ts at prerender time.
  ['build.manifest', (t, f) => oneLine(t, 'build: { manifest: true }', f, 'the vite manifest')],
  // `autoStaticPathsDiscovery` and `crawlLinks` both false is what keeps /docs out of dist, and
  // `failOnError` is what makes a broken prerender entry a failed build rather than a warning.
  ['the prerender options', (t, f) => matchedSpan(t, 'prerender: {', f, 'prerender settings')],
  // src/app/, not directly under src/ — without these three the build looks for src/router.* .
  ['the tanstackStart entries', (t, f) => oneLine(t, 'router: { entry:', f, 'the app entries')],
  // The one alias a generated project keeps as a runtime branch, because `site.theme.mode` must
  // stay editable after scaffolding.
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

// Indentation differs between the two files in places, and comments differ wherever one of them
// explains something the other does not have. Neither is an axis: this compares what the two
// files DO. Comment LINES only, never a trailing `//`, because `'http://localhost:3000'` is one of
// the values being compared.
const flat = (s) => stripCommentLines(s).replace(/\s+/g, ' ').trim()

/**
 * What `viteConfigTs` emits for `--backend=admin` must agree with the kit's own vite.config.ts.
 *
 * Guarded on `existsSync` for the same reason as the tsconfig, workspace and compose checks:
 * `apps/web/vite.config.ts` is not in `package.json`'s `files`, so under `pnpm dlx` it is not on
 * disk at all. It IS on disk in every working copy, which is the only place anyone edits it.
 */
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
 * The kit's tsconfig is the one this repo's own `pnpm typecheck` is proven against, and the
 * generated one is a template — so a compiler option added to one and not the other is a generated
 * project type-checked under different rules from the kit that produced it, with nothing saying so.
 *
 * Compared semantically, not textually: key order and formatting are not drift. Two differences are
 * expected and excluded — `paths` names the chosen boundary files (only the keys must match), and
 * `include` drops `configs`, which is never copied.
 *
 * Silent when the kit's tsconfig.json is absent, which is every `pnpm dlx` run: the file is not in
 * `package.json`'s `files`. That is not a hole, it is the only place the check can run — a change to
 * the kit's tsconfig can only be made in a working copy, where the file is here.
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
//
// TanStack writes `src/app/routeTree.gen.ts` from whatever is in `src/routes/`, and it names every
// route by import. That is why the file is templated here instead of copied: `src/routes/admin` is
// filtered out of a scaffold that declined the panel (`isAdminPath` in cli/kit-manifest.mjs), so a
// copied route tree would import five modules that are not there and `tsc` would stop on a
// generated file nobody wrote.
//
// Reproduced by hand rather than by running TanStack, because the CLI has no bundler and a scaffold
// must not need one before its first install. `assertRouteTreeMatchesKit` below is what keeps the
// hand copy honest.

/** Every admin-only line of `routeTree.gen.ts`, present or absent as one block per site. */
function routeTreeGen(answers) {
  // A chunk carries whatever whitespace has to disappear WITH it, which is not one fixed shape.
  // Thirteen of the fourteen below continue a line that stays, so they open with a newline and
  // end without one. The `AdminRouteChildren` block is the exception: it is a whole paragraph
  // between two lines that both stay, so it opens AND closes with a newline, and writing it like
  // the other thirteen would leave a stray blank line behind. Match the shape to where the chunk
  // sits, not to the thirteen.
  //
  // The three union types in `FileRouteTypes` are not chunks in this sense, and they are the one
  // place a bare `adm(…)` entry will not do. TanStack formats its output with prettier, which
  // breaks a union onto one member per line as soon as the single-line form passes 80 columns.
  // With the panel's routes in, `fullPaths` and `id` cross that width and `to` does not, so two
  // of the three change SHAPE and not only length. So each union is written as a ternary between
  // two spellings, and both helpers emit their own leading separator, a space or a newline,
  // because that separator is the character the two shapes disagree about.
  const isAdmin = answers.backend === 'admin'
  const adm = (text) => (isAdmin ? text : '')
  //
  // Both filter, and neither call site needs it today: every entry below is a literal. It stays
  // because the failure it prevents is silent and expensive. One `adm(…)` entry that evaluates
  // to `''` would put ` |  | ` into a NON-admin scaffold, where the drift assertion never looks,
  // since it only ever compares the admin output against the kit. The thing that would catch it
  // is a snapshot diff someone has to sit down and read.
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
 * The kit's own routeTree.gen.ts is written by TanStack, and this function claims to reproduce
 * it. When the kit's copy is on disk — a working copy, which is exactly where someone would add
 * a route — the two must be identical.
 *
 * Without this, adding a route to the kit and forgetting this template ships every scaffold a
 * route tree missing that route, and the only symptom is a 404 on a page that exists in the
 * source.
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
 * Every block the scaffold will hold: the kit's, then the ones typed at the block question.
 *
 * The three files below have to name all of them — they are what makes a block exist, and
 * `verify-build.mjs` fails a folder in `src/blocks/` that no registry entry mentions. Only the
 * things that read the KIT for a block (its copy links, its nav declaration, its npm dependencies)
 * stay on `answers.blocks`, because a block the kit has never heard of has none of them.
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
//
// Blocks link to each other by target id from inside their own copy files. Hero's and cta's
// `primaryCta` both point at `contact`, and cta's `secondaryCta` points at `features`. Those
// fields are required and every variant renders them, so picking a block whose copy names a
// block you did not pick ships a link to nothing.
//
// That failure is bad and tells you nothing about its cause. `createResolver`
// (src/lib/pages/resolve-link.ts) throws while rendering on the server, so the page comes out as
// an empty error boundary and `pnpm verify` reports `expected exactly 1 <h1>, found 0` on every
// page without ever mentioning a link. Reproduced with `--blocks=hero,features,cta`, which is a
// perfectly reasonable thing to ask for.
//
// Read from the copy files instead of hardcoding "hero and cta need contact", so a block that
// gains or loses a link needs no edit here. This is the same check `createResolver` does at
// render, moved to the last point where the answer can still change.
//
// `cli/index.mjs` calls this BEFORE the copy layer runs, not from inside `generateFiles`. That
// order is the point: with the call inside `generateFiles`, the copy layer had already written
// 60-odd files before this threw, and only the rollback cleaned up. The end state was fine
// either way, but "refuses before anything is written" was not true, and that claim is what the
// next person relies on.
/**
 * Every `target: '…'` a block's copy files name, with the file each one came from.
 *
 * The only place the copy files are read for links, so `assertBlockLinksResolve` below and
 * `readBlockDeps` further down cannot disagree about what the copy says.
 *
 * Comments are stripped first, like in `navTargets`, so a commented-out `target: 'features'` in
 * an example does not count as a real link.
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
      // Only block ids: the page ids this layer writes are `home`, which no copy targets, and
      // `contact`, which exists as a page only when the contact BLOCK was selected anyway.
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
//
// `assertBlockLinksResolve` above refuses an unbuildable selection AFTER it has been made. That is
// the right behaviour for the flag path and the wrong one for a prompt: a developer who unticks
// `contact` should be told while the question is still open. So the prompt layer needs the same
// fact up front, and gets it from each block's `requires.blocks` (src/lib/types.ts).
//
// That makes two descriptions of one fact — the manifest declaration and the copy files' actual
// `target`s — and two descriptions drift. The drift is not cosmetic: an under-declared manifest
// makes the prompt offer a combination `assertBlockLinksResolve` then refuses, which is precisely
// the bug the declaration exists to remove, and an over-declared one makes the prompt refuse a
// combination that would have built. Both are silent. So they are compared here, on every run,
// before either is used, and a mismatch is fatal.

/** What a block's copy actually requires: its link targets, minus itself. Sorted, deduped. */
function copyBlockDeps(kitRoot, id) {
  const deps = new Set()
  for (const { target } of copyLinkTargets(kitRoot, id)) {
    // A block linking to itself is always satisfied whenever it is selected, so it is not a
    // dependency — hero's `secondaryCta` targets `hero`. The manifests do not list it either.
    if (target !== id) deps.add(target)
  }
  return [...deps].sort()
}

/**
 * What a block's manifest DECLARES it requires: `requires: { …, blocks: [ … ] }`.
 *
 * Text-parsed with comments stripped, never imported — `block.ts` is TypeScript and this file is
 * plain `.mjs` under `pnpm dlx`, and the comment above every one of these arrays would otherwise
 * count as a declaration (each names the copy field, in quotes).
 *
 * An absent `requires`, or a `requires` without `blocks`, means no dependencies — which is the
 * truth for `features` and `contact` and is checked against the copy like every other block.
 *
 * `[^}]*` means the `requires` object must not contain a nested one: a `meta: { … }` alongside
 * `blocks` would end the match at the inner brace and hide the array behind it. That case is
 * detected and named rather than reported as an empty declaration — see below for why.
 */
function manifestBlockDeps(kitRoot, id) {
  const rel = `src/blocks/${id}/block.ts`
  const src = readKitFile(kitRoot, rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')

  // Returning `[]` for a manifest that plainly declares `blocks: [...]` would make the caller
  // report "declares requires.blocks: []" against a file where it is right there, and advise
  // setting it to a value it is already set to — an operator sent to a correct line to make a
  // change already made. A throw that fires and names the wrong cause costs more than silence,
  // because it is believed. So an unparseable `requires` is reported as unparseable.
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
 * `{ [blockId]: string[] }` for every block the kit ships — the prompt layer's copy of the
 * dependency graph. Throws if any manifest's declaration and its copy files disagree, naming both
 * sides so the fix is obvious from the message alone.
 *
 * Called from `cli/index.mjs` before `resolveAnswers`, so a kit whose manifests have drifted from
 * its copy cannot scaffold at all — not on the prompt path, not on the flag path, not with
 * `--yes`. A check that only ran on the path that consumes it would pass forever on CI, which only
 * ever runs `--yes`.
 */
/**
 * `BLOCK_ORDER` is hand-written, but `src/blocks/` is the real list. A block added to the kit and
 * not to that array is simply never offered, and nothing else would say so: every gate below
 * iterates `BLOCK_ORDER`, so the new block is invisible to all of them.
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
    // The DECLARED array, not `actual`. The two are equal — the throw above guarantees it, and
    // that is the only reason this is safe — but the prompt is specified to be driven by what the
    // manifests declare, and returning the copy-derived set instead would make that specification
    // true only by coincidence. The declaration drives; the throw above keeps it honest.
    deps[id] = declared
  }
  return deps
}

/**
 * One property per block, wrapped exactly where Biome would wrap it.
 *
 * Biome breaks after the `=>` when the single-line form exceeds the 100-column line width, and
 * `features` is the one block id long enough to trip it (102 columns). Reproducing the rule rather
 * than the result keeps a fresh scaffold's `pnpm lint` green with no `biome check --write` first —
 * which matters because the first thing a developer is told to run is `pnpm verify`, and `lint` is
 * its first gate.
 */
function blockModuleEntry(id) {
  const body = `import('./${id}/variants').then((m) => registerVariants('${id}', m.variants)),`
  const oneLine = `  ${id}: () => ${body}`
  return oneLine.length <= 100 ? oneLine : `  ${id}: () =>\n    ${body}`
}

function blockModulesTs(answers) {
  // The measured figure names react-hook-form and zod, which only ship with `contact`. Quoting it
  // in a scaffold without that block would explain the split with evidence from a block that is
  // not there.
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
  // Every relative import sorted together, `./registry` included. The block imports used to be
  // emitted as a group above it, which is correct only while every block id sorts before the
  // letter r: the kit's four do, so it held until the first block named `testimonials`.
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

/**
 * A block sitting on its own `defaultVariant` is emitted bare (`'hero'`), any other variant as an
 * object. `BlockRef` accepts both, and the bare form keeps a default scaffold's config free of
 * three lines that say nothing.
 */
function blockRef(id, answers) {
  const variant = answers.variants[id]
  // A block typed in at the block question has one layout and no entry in BLOCK_DEFAULT_VARIANT,
  // so without the fallback every one of them would be written in the three-line object form to
  // name the only layout it has.
  return variant === (BLOCK_DEFAULT_VARIANT[id] ?? CUSTOM_VARIANT)
    ? `'${id}'`
    : `{ id: '${id}', variant: '${variant}' }`
}

function blocksProperty(ids, answers) {
  const refs = ids.map((id) => blockRef(id, answers))
  const oneLine = `    blocks: [${refs.join(', ')}],`
  // Same reason as blockModuleEntry: match Biome's wrapping so a fresh scaffold lints clean.
  if (oneLine.length <= 100) return oneLine
  return ['    blocks: [', ...refs.map((ref) => `      ${ref},`), '    ],'].join('\n')
}

function pageLiteral(seoId, pageId, path, ids, answers) {
  const seo = PAGE_SEO[seoId]
  return [
    '  {',
    `    id: '${pageId}',`,
    `    path: '${path}',`,
    blocksProperty(ids, answers),
    '    seo: {',
    `      mn: { title: '${seo.mn.title}', description: '${seo.mn.description}' },`,
    `      en: { title: '${seo.en.title}', description: '${seo.en.description}' },`,
    '    },',
    '  },',
  ].join('\n')
}

/**
 * The kit's own `pages.config.ts` ships in the tarball (`src` is in `files`) even though it is
 * never copied, so this can run everywhere — unlike the tsconfig and workspace checks above.
 * Reworded SEO copy in the kit that never reached the CLI would otherwise be invisible: a scaffold
 * would simply keep saying the old thing, correctly and forever.
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
  // Blocks of your own go on the home page, after the kit's. Registering them without placing them
  // would build and verify perfectly and show nothing — the developer types a name, runs `pnpm
  // dev`, and finds the site unchanged.
  const home = answers.pages === 'multi' ? allBlocks(answers).filter((id) => id !== 'contact') : []
  const literals = []

  // Multi-page splits contact onto its own route, matching the kit's own default — unless contact
  // is the ONLY selected block, in which case the split would leave `/` with no blocks at all: a
  // page with no <h1>, which `verify-build.mjs` fails. One page holding the one block is the same
  // site, and it is the only shape these answers can take.
  if (answers.pages === 'multi' && hasContact && home.length > 0) {
    literals.push(pageLiteral('home', 'home', '/', home, answers))
    literals.push(pageLiteral('contact', 'contact', '/contact', ['contact'], answers))
  } else if (answers.pages === 'multi' && !hasContact) {
    literals.push(pageLiteral('home', 'home', '/', home, answers))
  } else {
    literals.push(pageLiteral('home', 'home', '/', allBlocks(answers), answers))
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
 * Which selected blocks may appear in `nav`, read from each block's own manifest rather than from a
 * list here.
 *
 * `createResolver` (src/lib/pages/resolve-link.ts) throws at render for a nav target that is not a
 * page id and not a block on any page, and `Header`'s `labelFor` falls back to printing the raw
 * target for a block with no `nav` key — a nav entry reading "cta". Both failures are downstream of
 * this one decision, and a hardcoded list here would keep producing them after a manifest changed.
 *
 * Comments are stripped first for the same reason `verify-build.mjs` strips them before scanning
 * the registry: a `// no nav here` would otherwise register as a declaration.
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

// A record of what was generated, not of current state. A developer who hand-adds a block makes
// this stale immediately, and that is fine — a future `add-block` must read it as history.
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
 * The only write this CLI ever makes outside its target directory, so it is narrow, conditional,
 * and always announced by the caller.
 *
 * A `pnpm-workspace.yaml` with no `packages:` key is pnpm configuration (this kit's own is exactly
 * that: `allowBuilds` and `overrides`, no workspace at all), not a workspace definition, and is
 * left completely alone. "Repo root" is the parent of the target and nothing above it: a developer
 * scaffolding into a nested path did not ask for a file three levels up to be edited.
 *
 * Appends one list entry. Never rewrites the file, so existing formatting, ordering and comments
 * survive — which also means an inline `packages: [a, b]` is reported rather than rewritten.
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

  // The block sequence under the key: blank lines and comments are passed over, anything that is
  // not a `- ` item ends it (the next mapping key, at whatever indent).
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

  // `*` is a real pnpm workspace pattern meaning every directory at the root, so it already covers
  // the new folder; appending beside it would be a duplicate that changes nothing.
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
 * Writes every file a scaffold cannot inherit into `outDir`.
 *
 * Assumes the copy layer has already run: nothing here is written twice and nothing here overlaps
 * `cli/kit-manifest.mjs`. Every drift assertion runs before this layer's first write, so a kit
 * that has moved on fails with nothing of its own left behind — and `assertBlockLinksResolve`,
 * the one check that rejects the *answers* rather than the kit, runs earlier still, in
 * `cli/index.mjs` ahead of the copy layer, so a refused combination creates no directory at all.
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

  // `?? 'none'` for the same reason as `cli/copy.mjs`: belt-and-braces for a caller that builds
  // an `answers` object by hand rather than through `resolveAnswers`.
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

  // Only when a backend was asked for, and generated at the project root, not under `api/`:
  // `docker-compose.yml` runs Postgres for the whole project, not just the Go service.
  if (hasBackend) files.push(['docker-compose.yml', dockerCompose])

  // Blocks of your own, from the same templates `add-block` uses — so a block created at scaffold
  // time and one added a month later are the same four files. The registry entries for them are
  // already in the three files above; these are the folders those entries point at.
  for (const id of answers.custom ?? []) {
    for (const [name, body] of Object.entries(blockFiles(id, [CUSTOM_VARIANT]))) {
      files.push([`src/blocks/${id}/${name}`, body])
    }
  }

  const written = []
  for (const [rel, text] of files) writeOut(outDir, rel, text, written)

  // Last, and the only check here that runs AFTER a write rather than before one. It has to: the
  // question is what the finished project imports, and neither layer alone knows that — the copy
  // layer put `src/` there and this one wrote the `package.json` being reconciled against. A
  // failure still leaves nothing behind, because `cli/index.mjs` wraps this whole call in the
  // same rollback the copy layer uses.
  assertShippedImportsAreDeclared(outDir, packageJsonText)
  return written
}
