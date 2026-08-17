// The generate layer: the files a scaffold cannot inherit, written fresh from the answers.
//
// Everything here is a string template plus the `Answers` object. Nothing is copied — the copy
// layer owns that, and the two lists are disjoint by construction (see `cli/kit-manifest.mjs`'s
// header: `src/config/`, `registry.ts`, `block-modules.ts` and `variants.all.ts` are deliberately
// absent from every COPY_* list precisely so this file can write them).
//
// Two of the files below are generated from a template rather than read from the kit, and that is
// forced rather than chosen: `tsconfig.json` and `pnpm-workspace.yaml` are NOT in `package.json`'s
// `files` array, so under `pnpm dlx` they do not exist on disk at all. Reading them at runtime
// would work in this repo and fail on every real install. Both therefore carry a drift assertion
// that runs only when the kit's own copy IS present (a working copy, i.e. exactly where a change
// to either file would be made), so an edit to one and not the other stops the CLI here.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { BLOCK_DEFAULT_VARIANT } from './prompts.mjs'

// --- the dependency split ----------------------------------------------------------------------
//
// The kit keeps every package in `devDependencies` (Task 1): it is a generator that ships no
// runtime, so nothing it depends on should be downloaded by a `pnpm dlx` that only copies files.
// A generated project is an app and wants the ordinary split, which is the exact opposite. So the
// versions come from the kit's manifest — one source of truth, no drift — and the *grouping* comes
// from the three lists below.
//
// Every name in all three lists must exist in the kit's manifest, and every name in the kit's
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
  // `src/submit-schema.ts` imports zod and is copied unconditionally, so this is never optional.
  'zod',
]

/** Runtime, but only when the block that needs it was selected. */
const BLOCK_RUNTIME_DEPS = { contact: ['react-hook-form'] }

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
  const src = join(kitRoot, rel)
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
// `biome ci .` is the generated project's `pnpm lint`, the FIRST gate of its `pnpm verify`, and it
// formats every `.json` file this layer writes. `JSON.stringify(…, null, 2)` puts every array
// element on its own line unconditionally; Biome collapses any array or object that fits inside the
// 100-column line width. The two disagree, and the disagreement is a lint error.
//
// Observed, not predicted: the first `pnpm verify` on a fresh scaffold failed on
// `.kit/scaffold.json`, because `"blocks"` had four short strings on four lines. It is worth being
// precise about why that file is even linted — the kit's own `.kit/` is hidden from Biome by
// `useIgnoreFile: true` reading this repo's `.gitignore`, but a fresh scaffold has no `.git` for
// that setting to consult, and the generated `.gitignore` deliberately un-ignores `scaffold.json`
// anyway, so it stays linted after `git init` too.
//
// Objects are safe either way (Biome, like Prettier, preserves an object the author expanded), but
// the same fits-or-expands rule is applied to both so the output has one shape and no special case.
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

const themeFile = (answers) => (answers.theme === 'both' ? 'theme.both.tsx' : 'theme.single.tsx')

// --- package.json ---------------------------------------------------------------------------------

function kitManifest(kitRoot) {
  const pkg = JSON.parse(readKitFile(kitRoot, 'package.json'))
  if (typeof pkg.version !== 'string' || pkg.version === '') {
    throw new Error(
      "Kit package.json has no 'version' — `.kit/scaffold.json` records which kit version " +
        'generated a project, and a scaffold that cannot say so is not worth writing',
    )
  }
  // Both groups, because which group the kit uses is Task 1's business and could change again;
  // what this layer needs is the version range, whichever side it is filed under.
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }

  for (const name of CLASSIFIED) {
    if (!Object.hasOwn(deps, name)) {
      throw new Error(
        `Kit package.json has no '${name}', but cli/generate.mjs classifies it. A rename or ` +
          'removal upstream would otherwise drop it from every generated project with no other ' +
          'signal — update the dependency lists in cli/generate.mjs',
      )
    }
  }
  for (const name of Object.keys(deps)) {
    if (!CLASSIFIED.includes(name)) {
      throw new Error(
        `Kit package.json lists '${name}', which cli/generate.mjs does not classify as runtime, ` +
          'build or excluded. Add it to RUNTIME_DEPS, BLOCK_RUNTIME_DEPS, BUILD_DEPS or ' +
          'EXCLUDED_DEPS — otherwise every generated project silently goes without it',
      )
    }
  }
  return { version: pkg.version, deps }
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

function packageJson(outDir, answers, { deps }) {
  const runtime = [...RUNTIME_DEPS]
  for (const [block, extra] of Object.entries(BLOCK_RUNTIME_DEPS)) {
    if (answers.blocks.includes(block)) runtime.push(...extra)
  }
  return json({
    name: packageName(outDir),
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite dev',
      build: 'vite build',
      typecheck: 'tsc --noEmit',
      lint: 'biome ci .',
      fix: 'biome check --write .',
      conventions: 'node scripts/check-conventions.mjs',
      verify:
        'pnpm lint && pnpm typecheck && pnpm conventions && pnpm build && node scripts/verify-build.mjs',
    },
    dependencies: pickDeps(runtime, deps),
    devDependencies: pickDeps(BUILD_DEPS, deps),
  })
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
  const kitFile = join(kitRoot, 'pnpm-workspace.yaml')
  if (existsSync(kitFile)) {
    const kitText = readFileSync(kitFile, 'utf8')
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

// --- vite.config.ts -------------------------------------------------------------------------------

// No KIT_* branching and no `configs/` import: a generated project has exactly one config and one
// implementation per boundary, so every branch the kit's own vite.config.ts carries has already
// been decided by the answers. The comments that survive are the ones explaining a decision the
// code cannot explain itself.
function viteConfigTs(answers) {
  return `import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pages } from './src/config/pages.config'
import { site } from './src/config/site.config'
import { enumerateUrls } from './src/lib/pages/enumerate'
import { emitSeoFiles } from './src/lib/seo/emit-plugin'
import { OUT_DIR } from './src/lib/seo/out-dir'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // Read by \`src/lib/seo/block-preloads.ts\` at prerender time: dist/client/.vite/manifest.json
  // maps each block's \`variants.ts\` to its built chunk, so the prerendered <head> can
  // modulepreload exactly the chunks a page's blocks need.
  build: { manifest: true },
  resolve: {
    alias: {
      '@/motion': r('./src/motion.animated.tsx'),
      '@/theme': r('./src/${themeFile(answers)}'),
      '@/submit': r('./src/submit.endpoint.ts'),
      '@/config': r('./src/config'),
      // Must stay LAST: '@' is a catch-all and would shadow the specific aliases above.
      '@': r('./src'),
    },
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        // Both false is what keeps /docs (absent from pages.config.ts) out of prerendering —
        // flip either and it prerenders into dist/client with no other warning in the source.
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
        concurrency: 8,
      },
      pages: enumerateUrls(pages, site).map((u) => ({
        path: u.path,
        prerender: { enabled: true, outputPath: u.outputPath },
      })),
    }),
    viteReact(),
    emitSeoFiles({ pages, site, outDir: OUT_DIR }),
  ],
})
`
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
    "paths": {
      "@/motion": ["./src/motion.animated.tsx"],
      "@/theme": ["./src/${themeFile(answers)}"],
      "@/submit": ["./src/submit.endpoint.ts"],
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
  const kitFile = join(kitRoot, 'tsconfig.json')
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

// --- the three block files ------------------------------------------------------------------------

/** Biome's `organizeImports` sorts by module specifier, so emitting in that order lints clean. */
const importOrder = (blocks) => [...blocks].sort()

function registryTs(answers) {
  const imports = importOrder(answers.blocks)
    .map((id) => `import { ${id} } from './${id}/manifest'`)
    .join('\n')
  const entries = answers.blocks.map((id) => `  ${id},`).join('\n')
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
// Blocks link to each other by target id from inside their own bilingual copy: hero's and cta's
// `primaryCta` both point at `contact`, and cta's `secondaryCta` points at `features`. Those are
// required fields on `HeroCopy` and `CtaCopy`, rendered unconditionally by every variant, and the
// copy files are copied verbatim — so selecting a block whose copy names an unselected block ships
// a link to nothing.
//
// The consequence is severe and says nothing about its cause. `createResolver`
// (src/lib/pages/resolve-link.ts) throws at RENDER, inside SSR, so the whole page comes out as an
// empty error boundary: `pnpm verify` then reports `expected exactly 1 <h1>, found 0` on every
// page and never mentions a link. Reproduced with `--blocks=hero,features,cta`, which is an
// entirely reasonable thing to ask for.
//
// Derived from the copy files rather than from a hardcoded "hero and cta need contact", for the
// same reason `navTargets` reads the manifests: a block that gains or loses a link must not need
// this file edited to stay correct. This is the static form of the check `createResolver` performs
// at render, moved to the only point where the answer can still be changed.
//
// Exported and called by `cli/index.mjs` BEFORE the copy layer runs, not from `generateFiles`.
// That ordering is the whole point and it was wrong once: with the call inside `generateFiles`,
// the copy layer had already written 60-odd files into the target by the time this threw, and
// only the rollback made the end state right. The end state was correct either way; the claim
// "refuses before anything is written" was not, and a claim is what the next person builds on.
export function assertBlockLinksResolve(kitRoot, answers) {
  for (const id of answers.blocks) {
    for (const locale of ['mn', 'en']) {
      const rel = `src/blocks/${id}/copy.${locale}.ts`
      const src = readKitFile(kitRoot, rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
      for (const [, target] of src.matchAll(/\btarget:\s*'([^']+)'/g)) {
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
  const entries = answers.blocks.map(blockModuleEntry).join('\n')
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
  const imports = importOrder(answers.blocks)
    .map((id) => `import { variants as ${id} } from './${id}/variants'`)
    .join('\n')
  const entries = answers.blocks.map((id) => `  ${id},`).join('\n')
  return `${imports}
import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Server-only: the prerenderer needs every block synchronously (one process, no per-page
 * dynamic import like \`src/client.tsx\`). Must stay unreachable from \`src/client.tsx\`, or every
 * component lands back in the client bundle.
 *
 * \`Record<BlockId, …>\` catches a missing block at compile time. Bare \`registerVariants(…)\` calls
 * did not: omitting one still compiled, linted and passed \`check-conventions.mjs\`, and failed only
 * as a 500 from \`getVariants\` when the un-prerendered \`/docs\` gallery rendered it.
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
  return variant === BLOCK_DEFAULT_VARIANT[id]
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
  const home = answers.pages === 'multi' ? answers.blocks.filter((id) => id !== 'contact') : []
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
    literals.push(pageLiteral('home', 'home', '/', answers.blocks, answers))
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
    const src = readKitFile(kitRoot, `src/blocks/${id}/manifest.ts`)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    return /\bnav:\s*\{/.test(src)
  })
}

function siteConfigTs(kitRoot, answers) {
  const targets = navTargets(kitRoot, answers)
  const nav = targets.map((id) => `{ target: '${id}' }`).join(', ')
  const theme =
    answers.theme === 'both' ? "{ mode: 'both', default: 'light' }" : "{ mode: 'light' }"
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

  const files = [
    ['package.json', packageJson(outDir, answers, manifest)],
    ['pnpm-workspace.yaml', pnpmWorkspaceYaml(kitRoot, manifest.deps)],
    ['.gitignore', GITIGNORE],
    ['vite.config.ts', viteConfigTs(answers)],
    ['tsconfig.json', tsconfig],
    ['src/blocks/registry.ts', registryTs(answers)],
    ['src/blocks/block-modules.ts', blockModulesTs(answers)],
    ['src/blocks/variants.all.ts', variantsAllTs(answers)],
    ['src/config/pages.config.ts', pagesConfigTs(answers)],
    ['src/config/site.config.ts', siteConfigTs(kitRoot, answers)],
    ['.kit/scaffold.json', scaffoldJson(answers, kitVersion)],
  ]

  const written = []
  for (const [rel, text] of files) writeOut(outDir, rel, text, written)
  return written
}
