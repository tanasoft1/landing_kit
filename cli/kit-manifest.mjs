// What a scaffolded project is made of, in one list.
//
// `package.json`'s `files` array decides what goes *into* the published tarball; this decides what
// comes back *out* of it. Two halves of one contract — a path added to the kit but not here is
// simply absent from every generated project, and nothing else would say so.
//
// `src/config/`, `src/blocks/registry.ts`, `src/blocks/block-modules.ts` and
// `src/blocks/variants.all.ts` are deliberately missing: they are written fresh per-answers by the
// generate layer, not copied. Copying them first would only mean overwriting them a moment later.
import { join } from 'node:path'

// Where the web template lives inside the kit. Every path in this file is relative to TWO
// places: this directory in the kit, and the ROOT of a generated project. Those used to be the
// same directory and are not any more, which is the entire reason this constant exists.
//
// A generated project stays flat. Only the kit's own copy moved, to make room for `apps/api`.
export const WEB_ROOT = 'apps/web'

// Paths read from the kit ROOT rather than from WEB_ROOT.
//
// Empty, and that is the design rather than an oversight. README.md was here once, to keep npm's
// package page at the repo root, and that split it from the tree that validates it:
// `scripts/check-conventions.mjs` resolves every path against its working directory, because it
// also has to run inside a flat generated project, so it could see `src/` and not the README it
// cross-checks. The template's README lives with the template; the kit root has its own.
//
// Kept as the seam: a kit file that genuinely belongs at the root, and is still copied to a
// generated project's root, goes here.
export const ROOT_SOURCED = []

/**
 * Where `rel` really is inside the kit.
 *
 * Every read of a kit file goes through this. A direct `join(kitRoot, rel)` anywhere would look
 * in the kit root, find nothing, and fail with "Kit is missing 'src/...'", which reads like a
 * broken tarball rather than a path that was never updated.
 */
export function kitPath(kitRoot, rel) {
  return join(kitRoot, ROOT_SOURCED.includes(rel) ? '' : WEB_ROOT, rel)
}

// Copied verbatim, recursively.
export const COPY_DIRS = [
  'src/components',
  'src/lib',
  'src/routes',
  'src/styles/presets', // filtered: only the chosen preset survives
  'public',
]

// Copied verbatim, individually.
export const COPY_FILES = [
  'src/app/client.tsx',
  'src/app/server.ts',
  'src/app/router.tsx',
  'src/app/routeTree.gen.ts',
  'src/integrations/motion.types.ts',
  'src/integrations/theme.types.ts',
  'src/blocks/variant-registry.ts',
  'scripts/check-conventions.mjs',
  'scripts/verify-build.mjs',
  'components.json',
]

// Chosen by answers; the unchosen half is never copied. A generated project ships exactly one
// implementation per boundary, so `motion.noop.tsx` and friends are not merely unused — they are
// not there. A value is either the path, or a function of the answers that returns it.
export const BOUNDARY_FILES = {
  motion: 'src/integrations/motion.animated.tsx', // deviation 5
  submit: 'src/integrations/submit.endpoint.ts', // deviation 5
  theme: (a) =>
    a.theme === 'both' ? 'src/integrations/theme.both.tsx' : 'src/integrations/theme.single.tsx',
}

// Copied with an edit, because the kit's own copy of each names things a generated project does
// not have. This list drives the transform loop in `copy.mjs`, so a file listed here with no
// transform registered is an error rather than a verbatim copy nobody notices.
// Each of the last five is here for one reason: the kit ships TWO implementations behind every
// `@/motion`, `@/theme` and `@/submit` alias and a generated project gets exactly one, so the
// surviving half's own prose explains itself by pointing at the half that is not there — and
// `biome.json` bans imports of files no scaffold contains. Same rule as the README: a generated
// project may not describe machinery it does not have.
export const TRANSFORMED_FILES = [
  'README.md',
  'src/styles/theme.css',
  'src/components/docs/config-reference.tsx',
  'src/components/docs/token-gallery.tsx',
  'src/integrations/motion.animated.tsx',
  'src/integrations/submit.endpoint.ts',
  'src/integrations/submit-schema.ts',
  'biome.json',
]

// Never copied under any answers. Not documentation: `copy.mjs` checks every path it is about to
// write against both lists below, so a stray COPY_DIRS entry is a loud failure rather than a
// `docs/` folder quietly shipped into a client repo.
//
// Refusal, not omission, and that is the difference from IGNORED_NAMES below: anything here being
// reachable at all means the kit or this manifest is wrong, and shipping it would be worse than
// stopping.
//
// Two lists because the entries mean two different things, and conflating them is wrong in both
// directions. These are REPO-ROOT paths, not `WEB_ROOT`-relative, even though every `rel` that
// reaches `assertCopyable` today is `WEB_ROOT`-relative. Matching them at any depth would reject
// `src/components/docs/`, a directory the kit really does ship.
//
// That root split makes the entries here reachable by two different routes. `configs` and
// `lighthouserc*.json` moved into `apps/web/` with the template, so a `WEB_ROOT`-relative `rel`
// can still name them, and they are live: try to copy either and this list is what stops it.
// `cli`, `docs`, `.superpowers` and `pnpm-lock.yaml` did not move; they name things that only ever
// existed at the repo root, so no `WEB_ROOT`-relative `rel` can reach them and they are currently
// unreachable dead code, kept anyway. They become reachable again the moment `ROOT_SOURCED` gains
// an entry pointing above `WEB_ROOT`, which is exactly the case this list exists to stop, so
// deleting the currently-unreachable half would remove the guard for the day it starts mattering
// again.
export const NEVER_COPY = [
  'cli',
  'docs',
  '.superpowers',
  'configs',
  'lighthouserc.json',
  'lighthouserc.desktop.json',
  'pnpm-lock.yaml',
]

// These are names that are wrong at ANY depth, so they are matched per path segment. The walk
// descends into whatever is really on disk rather than a listing, so a nested `dist/` or
// `node_modules/` inside a copied tree reaches the check with a perfectly innocent prefix in front
// of it — and unlike `.DS_Store`, `npm pack` does not strip those.
export const NEVER_COPY_ANYWHERE = ['node_modules', 'dist', '.kit', '.git']

// Skipped wherever they turn up in a copied tree, silently. Not NEVER_COPY: `.DS_Store` is written
// by the Finder beside any folder someone has looked at, so a kit checked out on macOS routinely
// has them and refusing to scaffold over one would break the tool on the machine it is developed
// on. `npm pack` strips them from the published tarball, so this only matters when the CLI runs
// against a working copy — which is exactly how it is tested. Exact names, no globbing: editor
// swap files (`.foo.ts.swp`) are transient and deliberately not chased.
export const IGNORED_NAMES = ['.DS_Store']

// The one COPY_DIRS entry that is filtered rather than copied whole.
export const PRESET_DIR = 'src/styles/presets'

/** Each selected block copies its folder in full; unselected block folders are not copied. */
export const blockDir = (id) => `src/blocks/${id}`

// --- the API tree ------------------------------------------------------------------------------
//
// Where the Go service lives inside the kit, and where it lands in a generated project. Two
// constants because they differ: the kit is a pnpm workspace whose packages sit under apps/, and a
// generated project is a flat web app with the service beside it. Keeping the generated project
// flat is what lets cli/add.mjs stay unaware that a backend exists at all.
export const API_ROOT = 'apps/api'
export const API_DEST = 'api'

// Copied verbatim, recursively, only when the backend is included. `internal/db/sqlc` is in here on
// purpose: the generated code is committed in both reference repos, so a scaffolded project builds
// without anyone running sqlc first.
export const API_COPY_DIRS = ['cmd', 'conf', 'internal']

// Individually. `.env.example` is the file a developer copies to `.env`, so it is the one piece of
// config the scaffold must carry.
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
