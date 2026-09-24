// What a scaffolded project is made of. `package.json` `files` decides what goes into the tarball;
// this decides what comes out. `src/config/` and the three block registries are generated per
// answers, not copied.
import { join } from 'node:path'

// Where the web template lives in the kit. Paths here are relative to it, and to the root of a
// generated project.
export const WEB_ROOT = 'apps/web'

/** Where `rel` really is inside the kit. Every kit read goes through this. */
export function kitPath(kitRoot, rel) {
  return join(kitRoot, WEB_ROOT, rel)
}

// Copied verbatim, recursively.
export const COPY_DIRS = [
  'src/components',
  'src/lib',
  'src/routes',
  'src/styles/presets', // filtered: only the chosen preset survives
  'public',
]

// Copied recursively, only for `backend=admin`.
export const ADMIN_COPY_DIRS = ['src/admin']

// Admin route paths inside a directory COPY_DIRS copies whole, so they are filtered out instead.
// A prefix test covers both `src/routes/admin` and `src/routes/admin.tsx`.
export const ADMIN_ROUTE_PATHS = ['src/routes/admin']

/**
 * Whether `rel` is one of the panel's route files. Not a general "is this the panel" test.
 * `assertAdminPathsExist` in copy.mjs checks that each prefix names something real.
 */
export const isAdminPath = (rel) =>
  ADMIN_ROUTE_PATHS.some((p) => rel === `${p}.tsx` || rel.startsWith(`${p}/`))

// Every place panel content may live. `assertPanelStaysInItsRoots` in copy.mjs uses the union to
// catch a panel file that landed anywhere else.
export const ADMIN_ROOTS = [...ADMIN_COPY_DIRS, ...ADMIN_ROUTE_PATHS]

/** Whether `rel` is inside the panel's declared roots — the directory, or its `.tsx` sibling. */
export const isUnderAdminRoot = (rel) =>
  ADMIN_ROOTS.some((p) => rel === p || rel === `${p}.tsx` || rel.startsWith(`${p}/`))

// Copied verbatim, individually.
export const COPY_FILES = [
  'src/app/client.tsx',
  'src/app/server.ts',
  'src/app/router.tsx',
  // `src/app/routeTree.gen.ts` is not here: `routeTreeGen` in generate.mjs writes it, with admin
  // routes only for `--backend=admin`.
  'src/integrations/motion.types.ts',
  'src/integrations/submit-schema.ts',
  // Both halves ship: the generated vite.config.ts picks one from `site.theme.mode`.
  'src/integrations/theme.both.tsx',
  'src/integrations/theme.single.tsx',
  'src/integrations/theme.types.ts',
  'src/blocks/variant-registry.ts',
  'scripts/check-conventions.mjs',
  'scripts/verify-build.mjs',
]

// Chosen by answers; the other half is never copied. A value is a path, or a function of the
// answers that returns one. `@/theme` isn't here because both its halves ship.
export const BOUNDARY_FILES = {
  motion: 'src/integrations/motion.animated.tsx', // deviation 5
  submit: 'src/integrations/submit.endpoint.ts', // deviation 5
}

// Copied with an edit, by the transform registered for each file in copy.mjs (a missing transform
// is an error). Each transform also gets `answers`, because `README.md`, `theme.css` and
// `components.json` depend on whether the admin panel was chosen.
export const TRANSFORMED_FILES = [
  'README.md',
  'components.json',
  'src/styles/theme.css',
  'biome.json',
]

// Never copied under any answers, matched on the first path segment only, so
// `src/components/docs/` still ships. `configs` and the lighthouse files sit in the web template;
// the rest are repo-root names, kept as a guard.
export const NEVER_COPY = [
  'cli',
  'docs',
  '.superpowers',
  'configs',
  'lighthouserc.json',
  'lighthouserc.desktop.json',
  'pnpm-lock.yaml',
]

// Wrong at any depth, so matched per path segment. `npm pack` doesn't strip these.
export const NEVER_COPY_ANYWHERE = ['node_modules', 'dist', '.kit', '.git']

// Skipped silently wherever they appear. The Finder writes `.DS_Store` all over macOS.
export const IGNORED_NAMES = ['.DS_Store']

// The one COPY_DIRS entry that is filtered rather than copied whole.
export const PRESET_DIR = 'src/styles/presets'

/** A selected block's folder. Only its chosen layout is copied; see `pickVariant` in copy.mjs. */
export const blockDir = (id) => `src/blocks/${id}`

// --- the API tree ------------------------------------------------------------------------------
// In the kit it is `apps/api`; in a generated project it is `api/` beside the flat web app.
export const API_ROOT = 'apps/api'
export const API_DEST = 'api'

// Copied recursively, only when the backend is included. The generated sqlc code comes along, so a
// project builds without running sqlc.
export const API_COPY_DIRS = ['cmd', 'conf', 'internal']

// `.env.example` is the file a developer copies to `.env`.
export const API_COPY_FILES = [
  'go.mod',
  'go.sum',
  'sqlc.yaml',
  'makefile',
  '.air.toml',
  '.golangci.yml',
  '.env.example',
  'README.md',
]

/** Where `rel` is inside the kit's API tree. */
export function apiPath(kitRoot, rel) {
  return join(kitRoot, API_ROOT, rel)
}

// The one `dist` path under the API that must copy: the placeholder keeps `//go:embed all:dist`
// compiling before the web app is built. Anything else under internal/static/dist is refused, so a
// maintainer's local build never ships.
export const API_STATIC_DIST = 'internal/static/dist'
export const API_STATIC_PLACEHOLDER = `${API_STATIC_DIST}/.placeholder`
