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
  'src/client.tsx',
  'src/server.ts',
  'src/router.tsx',
  'src/routeTree.gen.ts',
  'src/motion.types.ts',
  'src/theme.types.ts',
  'src/submit-schema.ts',
  'src/blocks/variant-registry.ts',
  'scripts/check-conventions.mjs',
  'scripts/verify-build.mjs',
  'biome.json',
  'components.json',
  'tsr.config.json',
]

// Chosen by answers; the unchosen half is never copied. A generated project ships exactly one
// implementation per boundary, so `motion.noop.tsx` and friends are not merely unused — they are
// not there. A value is either the path, or a function of the answers that returns it.
export const BOUNDARY_FILES = {
  motion: 'src/motion.animated.tsx', // deviation 5
  submit: 'src/submit.endpoint.ts', // deviation 5
  theme: (a) => (a.theme === 'both' ? 'src/theme.both.tsx' : 'src/theme.single.tsx'),
}

// Copied with an edit, because the kit's own copy of each names things a generated project does
// not have. This list drives the transform loop in `copy.mjs`, so a file listed here with no
// transform registered is an error rather than a verbatim copy nobody notices.
export const TRANSFORMED_FILES = [
  'README.md',
  'src/styles/theme.css',
  'src/components/docs/config-reference.tsx',
]

// Never copied under any answers. Not documentation: `copy.mjs` checks every path it is about to
// write against this list, so a stray COPY_DIRS entry is a loud failure rather than a `docs/`
// folder quietly shipped into a client repo.
export const NEVER_COPY = [
  'cli',
  'docs',
  '.superpowers',
  'configs',
  'lighthouserc.json',
  'lighthouserc.desktop.json',
  'pnpm-lock.yaml',
  'node_modules',
  'dist',
  '.kit',
  '.git',
]

// The one COPY_DIRS entry that is filtered rather than copied whole.
export const PRESET_DIR = 'src/styles/presets'

/** Each selected block copies its folder in full; unselected block folders are not copied. */
export const blockDir = (id) => `src/blocks/${id}`
