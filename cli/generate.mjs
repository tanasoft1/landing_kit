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
import { basename, dirname, join } from 'node:path'
import { blockFiles } from './add.mjs'
import { BLOCK_DEFAULT_VARIANT, BLOCK_ORDER, CUSTOM_VARIANT } from './prompts.mjs'

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
  // `src/integrations/submit-schema.ts` imports zod and is always copied, so this is never
  // optional.
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
      // Chains the binaries directly rather than `pnpm lint && pnpm typecheck && …`. Naming the
      // package manager here would hard-require pnpm: `npm run verify` would die on
      // `pnpm: command not found`, which is a miserable first experience for anyone who installed
      // with npm. Every package manager puts `node_modules/.bin` on PATH for a script, so this
      // form works under all three.
      verify:
        'biome ci . && tsc --noEmit && node scripts/check-conventions.mjs && vite build && node scripts/verify-build.mjs',
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
  resolve: {
    alias: {
      '@/motion': r('./src/integrations/motion.animated.tsx'),
      '@/theme': r('./src/integrations/${themeFile(answers)}'),
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
        '  Fix: keep `requires` flat (`{ npm: [], ui: [], blocks: [...] }`), or teach\n' +
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
  const onDisk = readdirSync(join(kitRoot, 'src/blocks'), { withFileTypes: true })
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
  return written
}
