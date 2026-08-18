// What a scaffolded project is made of, in one list.
//
// `package.json`'s `files` array decides what goes *into* the published tarball; this decides what
// comes back *out* of it. Two halves of one contract — a path added to the kit but not here is
// simply absent from every generated project, and nothing else would say so.
//
// `src/config/`, `src/blocks/registry.ts`, `src/blocks/block-modules.ts` and
// `src/blocks/variants.all.ts` are deliberately missing: they are written fresh per-answers by the
// generate layer, not copied. Copying them first would only mean overwriting them a moment later.

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
// directions. These are ROOT paths — `docs/` the plan folder, `configs/` the alternate-config
// tree. Matching them at any depth would reject `src/components/docs/`, a directory the kit really
// does ship.
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
