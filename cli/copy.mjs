// The copy layer: kit files in, project files out. Everything is verbatim or a named, exact-match
// edit. Generation is the next layer's job.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, posix } from 'node:path'
import {
  ADMIN_COPY_DIRS,
  ADMIN_ROOTS,
  ADMIN_ROUTE_PATHS,
  API_COPY_DIRS,
  API_COPY_FILES,
  API_DEST,
  API_STATIC_DIST,
  API_STATIC_PLACEHOLDER,
  apiPath,
  BOUNDARY_FILES,
  blockDir,
  COPY_DIRS,
  COPY_FILES,
  IGNORED_NAMES,
  isAdminPath,
  isUnderAdminRoot,
  kitPath,
  NEVER_COPY,
  NEVER_COPY_ANYWHERE,
  PRESET_DIR,
  TRANSFORMED_FILES,
} from './kit-manifest.mjs'

// --- README sections a generated project must not have -----------------------------------------
// Dropped from the README and its Contents list. None of them are /docs RECIPES entries.
const DROPPED_SECTIONS = [
  // A generated project already exists.
  'Create your site',
  'Scaffolding options',
  // Points at MAINTAINERS.md, which doesn't ship.
  'Working on the kit itself',
]

// Dropped unless the project chose `--backend=admin`. Renaming the heading without renaming it
// here fails every non-admin scaffold.
const ADMIN_README_SECTION = 'The admin panel'

// --- guards -----------------------------------------------------------------------------------

// Never write into a directory that has anything in it, dotfiles included: a `.git` means it is
// someone's repository.
function assertEmptyTarget(outDir, label) {
  if (!existsSync(outDir)) return
  if (!statSync(outDir).isDirectory()) {
    throw new Error(`Target '${label}' already exists and is not a directory`)
  }
  if (readdirSync(outDir).length > 0) {
    throw new Error(`Target directory '${label}' already exists and is not empty`)
  }
}

// What may never be copied, whatever the manifest says. The API's static dist directory and its
// placeholder are matched exactly first; every other `dist` path is refused below.
function assertCopyable(rel) {
  if (rel === API_STATIC_DIST || rel === API_STATIC_PLACEHOLDER) return
  const segments = rel.split('/')
  if (NEVER_COPY.includes(segments[0])) {
    throw new Error(`Refusing to copy '${rel}': '${segments[0]}' is in NEVER_COPY`)
  }
  for (const segment of segments) {
    if (NEVER_COPY_ANYWHERE.includes(segment)) {
      throw new Error(`Refusing to copy '${rel}': '${segment}' is in NEVER_COPY_ANYWHERE`)
    }
  }
}

// --- the panel's boundary, asserted rather than assumed -----------------------------------------
// Two checks: every admin prefix names something real, and nothing panel-shaped lives outside the
// declared roots. Without them, a stray panel file shipped to every non-admin project silently.

/**
 * Every declared admin path names something real in the kit. Otherwise renaming `src/admin` would
 * quietly ship the panel's routes to every project.
 */
function assertAdminPathsExist(kitRoot) {
  for (const rel of ADMIN_COPY_DIRS) {
    if (!existsSync(kitPath(kitRoot, rel))) {
      throw new Error(
        `ADMIN_COPY_DIRS names '${rel}', which is not in the kit. That list is what keeps the ` +
          'panel out of a project that declined it; a name that matches nothing excludes ' +
          "nothing — update cli/kit-manifest.mjs to the directory's real name.",
      )
    }
  }
  for (const rel of ADMIN_ROUTE_PATHS) {
    if (existsSync(kitPath(kitRoot, rel)) || existsSync(kitPath(kitRoot, `${rel}.tsx`))) continue
    throw new Error(
      `ADMIN_ROUTE_PATHS names '${rel}', and neither '${rel}/' nor '${rel}.tsx' is in the kit. ` +
        'That prefix is the only thing filtering the panel out of `src/routes`, which COPY_DIRS ' +
        'copies whole, so a prefix that matches nothing ships every panel route to every ' +
        'project — silently. Update cli/kit-manifest.mjs to the real path.',
    )
  }
}

// Panel content means a path segment or basename starting with `admin`, or a file that imports
// from `src/admin`. A neutrally named file with no panel imports isn't caught here; the snapshot
// diff catches that.
const ADMIN_NAMED = (rel) =>
  rel
    .split('/')
    .some((seg) => seg === 'admin' || seg.startsWith('admin.') || seg.startsWith('admin-'))

const PANEL_IMPORT_ALIAS = '@/admin'

// A regex, not a parser, to avoid a dependency. Comment lines are skipped because the kit's
// comments often quote imports.
const IMPORT_FROM =
  /^[ \t]*(?:import|export)[ \t][^'"\n]*(?:\n[^'"\n]*)*?\bfrom[ \t]*['"]([^'"\n]+)['"]/gm
const BARE_IMPORT = /^[ \t]*import[ \t]*['"]([^'"\n]+)['"]/gm
const READ_FOR_IMPORTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

const withoutCommentLines = (text) =>
  text
    .split('\n')
    .filter((l) => !/^[ \t]*(?:\/\/|\/?\*)/.test(l))
    .join('\n')

/** Which admin root, if any, `spec` imported from `rel` reaches into. */
function panelImport(rel, spec) {
  if (spec === PANEL_IMPORT_ALIAS || spec.startsWith(`${PANEL_IMPORT_ALIAS}/`)) return spec
  if (!spec.startsWith('.')) return null
  const resolved = posix.normalize(posix.join(posix.dirname(rel), spec))
  return isUnderAdminRoot(resolved) ? resolved : null
}

/**
 * Nothing outside the panel's roots looks like panel content. Only the trees copied whole are
 * walked; files copied by name need no check.
 */
function assertPanelStaysInItsRoots(kitRoot) {
  const problems = []
  const walk = (rel) => {
    const src = kitPath(kitRoot, rel)
    if (!existsSync(src)) return
    for (const entry of readdirSync(src, { withFileTypes: true })) {
      if (IGNORED_NAMES.includes(entry.name)) continue
      const childRel = `${rel}/${entry.name}`
      if (isUnderAdminRoot(childRel)) continue
      const named = ADMIN_NAMED(childRel)
      if (entry.isDirectory()) {
        if (named) problems.push(`  ${childRel}/  is named for the panel`)
        else walk(childRel)
        continue
      }
      if (named) {
        problems.push(`  ${childRel}  is named for the panel`)
        continue
      }
      if (!READ_FOR_IMPORTS.some((e) => entry.name.endsWith(e))) continue
      const text = withoutCommentLines(readFileSync(join(src, entry.name), 'utf8'))
      for (const pattern of [IMPORT_FROM, BARE_IMPORT]) {
        pattern.lastIndex = 0
        for (const m of text.matchAll(pattern)) {
          if (panelImport(childRel, m[1])) {
            problems.push(`  ${childRel}  imports the panel ('${m[1]}')`)
          }
        }
      }
    }
  }

  for (const dir of COPY_DIRS) walk(dir)
  walk('src/blocks')
  if (problems.length === 0) return
  throw new Error(
    'Panel content is outside the roots the panel is allowed to live in ' +
      `(${ADMIN_ROOTS.join(', ')}). Everything below is copied WHOLE by COPY_DIRS, so it ` +
      'reaches every project including the ones that answered `none` and `api` — the exclusion ' +
      'mechanisms only know how to skip the two roots.\n' +
      `${[...new Set(problems)].sort().join('\n')}\n` +
      'Move it under src/admin (or src/routes/admin), or if it is not panel content, rename it ' +
      'so it does not claim to be.',
  )
}

// --- primitives -------------------------------------------------------------------------------

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

function copyOne(kitRoot, outDir, rel, written) {
  assertCopyable(rel)
  const src = kitPath(kitRoot, rel)
  if (!existsSync(src)) throw new Error(`Kit is missing '${rel}' — cannot scaffold without it`)
  const dest = join(outDir, rel)
  mkdirSync(dirname(dest), { recursive: true })
  // Byte copy, not a read-and-write: `public/` holds JPEGs.
  copyFileSync(src, dest)
  written.push(rel)
}

// `keep` is per-file, so a directory is never pruned wholesale by accident.
function copyTree(kitRoot, outDir, rel, written, keep) {
  assertCopyable(rel)
  const src = kitPath(kitRoot, rel)
  if (!existsSync(src)) throw new Error(`Kit is missing '${rel}/' — cannot scaffold without it`)
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )
  for (const entry of entries) {
    if (IGNORED_NAMES.includes(entry.name)) continue
    const childRel = `${rel}/${entry.name}`
    if (entry.isDirectory()) copyTree(kitRoot, outDir, childRel, written, keep)
    else if (keep(childRel)) copyOne(kitRoot, outDir, childRel, written)
  }
}

// --- the API tree -------------------------------------------------------------------------------
// Like copyOne/copyTree, but the source is apiPath and every destination is under API_DEST.

function copyOneApi(kitRoot, outDir, rel, written) {
  assertCopyable(rel)
  const src = apiPath(kitRoot, rel)
  if (!existsSync(src)) {
    throw new Error(`Kit is missing 'apps/api/${rel}' — cannot scaffold a backend without it`)
  }
  const destRel = `${API_DEST}/${rel}`
  const dest = join(outDir, destRel)
  mkdirSync(dirname(dest), { recursive: true })
  // Byte copy, like copyOne. Nothing in the API tree is transformed.
  copyFileSync(src, dest)
  written.push(destRel)
}

function copyTreeApi(kitRoot, outDir, rel, written) {
  assertCopyable(rel)
  const src = apiPath(kitRoot, rel)
  if (!existsSync(src)) {
    throw new Error(`Kit is missing 'apps/api/${rel}/' — cannot scaffold a backend without it`)
  }
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )
  for (const entry of entries) {
    if (IGNORED_NAMES.includes(entry.name)) continue
    const childRel = `${rel}/${entry.name}`
    if (entry.isDirectory()) copyTreeApi(kitRoot, outDir, childRel, written)
    // No `keep` filter here, unlike copyTree: nothing under API_COPY_DIRS is answer-filtered or
    // transformed, so every file the kit ships in cmd/, conf/ and internal/ ships to the scaffold,
    // *_test.go and internal/testsupport included — see the plan's note on why tests ship.
    else copyOneApi(kitRoot, outDir, childRel, written)
  }
}

/** Copies apps/api into `outDir/api`. Only called when `answers.backend !== 'none'`. */
function copyApiTree(kitRoot, outDir, written) {
  for (const dir of API_COPY_DIRS) copyTreeApi(kitRoot, outDir, dir, written)
  for (const rel of API_COPY_FILES) copyOneApi(kitRoot, outDir, rel, written)
}

// --- README.md --------------------------------------------------------------------------------

// Line indices of the real '## ' headings. Fence-aware, so a '## ' line inside a code block
// doesn't end a section early.
function headingIndices(lines) {
  const out = []
  let inFence = false
  for (const [i, line] of lines.entries()) {
    if (line.trimStart().startsWith('```')) inFence = !inFence
    else if (!inFence && line.startsWith('## ')) out.push(i)
  }
  if (inFence) {
    throw new Error('README.md: unclosed ``` fence — cannot tell headings from fenced code')
  }
  return out
}

/** `[start, end)` line range of one '## ' section, end-exclusive. Throws if the heading is gone. */
function sectionRange(lines, heading, why) {
  const headings = headingIndices(lines)
  const at = headings.findIndex((i) => lines[i].trimEnd() === `## ${heading}`)
  if (at === -1) throw new Error(`README.md: no '## ${heading}' heading — ${why}`)
  return [headings[at], at + 1 < headings.length ? headings[at + 1] : lines.length]
}

// Exact heading match, and a miss throws.
function dropSection(lines, heading) {
  const [start, end] = sectionRange(
    lines,
    heading,
    'it was renamed or already gone, and a generated project would keep a section describing ' +
      'something it does not have',
  )
  lines.splice(start, end - start)
}

// Scoped to the Contents block: the same link text can appear in the body.
function dropContentsEntry(lines, heading) {
  const [start, end] = sectionRange(lines, 'Contents', 'cannot trim its list')
  const prefix = `- [${heading}](#`
  const at = lines.findIndex((l, i) => i > start && i < end && l.trimStart().startsWith(prefix))
  if (at === -1) {
    throw new Error(
      `README.md: Contents has no entry for '${heading}' — the section is being removed, so a ` +
        'missing entry means the two lists had already drifted',
    )
  }
  lines.splice(at, 1)
}

// A miss throws, and so does a second match.
function replaceExactText(text, file, from, to) {
  const at = text.indexOf(from)
  // The first non-empty line, so a match that starts with a line break still has a useful message.
  const first = from.split('\n').find((l) => l !== '') ?? from
  const shown = first.length > 90 ? `${first.slice(0, 90)}…` : first
  if (at === -1) throw new Error(`${file}: expected text not found: ${shown}`)
  if (text.indexOf(from, at + from.length) !== -1) {
    throw new Error(`${file}: expected text is not unique, so the edit is ambiguous: ${shown}`)
  }
  return text.slice(0, at) + to + text.slice(at + from.length)
}

function transformReadme(text, answers) {
  const lines = text.split('\n')
  for (const heading of DROPPED_SECTIONS) {
    dropContentsEntry(lines, heading)
    dropSection(lines, heading)
  }
  // Conditional on the answer, unlike the lists above.
  if (answers.backend !== 'admin') {
    dropContentsEntry(lines, ADMIN_README_SECTION)
    dropSection(lines, ADMIN_README_SECTION)
  }
  const out = lines.join('\n')
  // Cutting the final section leaves the blank line that separated it; one trailing newline.
  return `${out.replace(/\n+$/, '')}\n`
}

// --- src/styles/theme.css ---------------------------------------------------------------------

// `replacement === null` deletes the line. A miss throws, so a wrong preset import can't slip by.
function replaceExactLine(lines, file, needle, replacement) {
  const at = lines.findIndex((l) => l.trim() === needle)
  if (at === -1) throw new Error(`${file}: expected line not found: ${needle}`)
  if (replacement === null) lines.splice(at, 1)
  else lines[at] = replacement
}

function transformThemeCss(text, answers) {
  const file = 'src/styles/theme.css'
  const lines = text.split('\n')
  replaceExactLine(
    lines,
    file,
    '@import "./presets/editorial.css";',
    `@import "./presets/${answers.preset}.css";`,
  )
  // `configs/` is never copied, so its `@source` line goes.
  replaceExactLine(lines, file, '@source "../../configs/**/*.{ts,tsx}";', null)
  let out = lines.join('\n')
  if (answers.backend !== 'admin') {
    // The panel's animation import and its comment, removed together. Without the panel the
    // package isn't in `package.json`, so the import would break the build. Change the wording in
    // theme.css and this throws by name.
    out = replaceExactText(
      out,
      `${file} (tw-animate-css)`,
      `
/* Animation utilities for the panel's sheet and dropdown. Import it here, inside Tailwind, so
   only used classes ship. Imported from any other stylesheet, the whole library ships. */
@import "tw-animate-css";
`,
      '',
    )
  }
  return out
}

// --- biome.json ---------------------------------------------------------------------------------

// Drops the `noRestrictedImports` entries for `@/motion.noop` and `@/submit.rpc`, which a
// generated project doesn't have. Entries for files that did ship stay: they stop direct imports
// bypassing the alias.
const BIOME_INDENT = ' '.repeat(18)
const themeRule = (half) =>
  `${BIOME_INDENT}"@/integrations/theme.${half}": "Import '@/theme' — the alias selects the implementation."`

function transformBiomeJson(text) {
  const file = 'biome.json'
  // The kit's `vcs.root` points two levels up to the repo's `.gitignore`. A generated project is
  // flat, so the key is removed and the default is right.
  let out = replaceExactText(
    text,
    `${file} (vcs root)`,
    ', "useIgnoreFile": true, "root": "../.." }',
    ', "useIgnoreFile": true }',
  )
  out = replaceExactText(
    out,
    `${file} (motion.noop entry)`,
    `${BIOME_INDENT}"@/integrations/motion.noop": "Import '@/motion' — the alias selects the implementation.",\n`,
    '',
  )
  // Anchored on the theme pair: the three lines together are unique, the submit line alone isn't.
  out = replaceExactText(
    out,
    `${file} (blocks override)`,
    `${themeRule('both')},\n${themeRule('single')},\n` +
      `${BIOME_INDENT}"@/integrations/submit.rpc": "Import '@/submit' — the alias selects the implementation.",\n`,
    `${themeRule('both')},\n${themeRule('single')},\n`,
  )

  // Line surgery can break the JSON, so parse it here instead of failing the project's lint.
  try {
    JSON.parse(out)
  } catch (err) {
    throw new Error(
      `${file}: the transformed file is not valid JSON (${err.message}). The alias entries are ` +
        "removed as whole pairs to respect JSON's no-trailing-comma rule — check those edits, " +
        "or the kit's own biome.json.",
    )
  }
  return out
}

// shadcn's aliases point at `src/admin` in the kit. Without the panel they go back to shadcn's
// defaults, so `shadcn add` doesn't build an admin tree. Note that shadcn components in
// `src/components` fail check-conventions (the `cn(...)` and bracket rules).
function transformComponentsJson(text, answers) {
  if (answers.backend === 'admin') return text
  return replaceExactText(
    text,
    'components.json (aliases)',
    `  "aliases": {
    "components": "@/admin",
    "utils": "@/admin/lib/utils",
    "ui": "@/admin/ui",
    "lib": "@/admin/lib",
    "hooks": "@/admin/hooks"
  }`,
    `  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }`,
  )
}

const TRANSFORMS = {
  'README.md': transformReadme,
  'components.json': transformComponentsJson,
  'src/styles/theme.css': transformThemeCss,
  'biome.json': transformBiomeJson,
}

// --- the copier -------------------------------------------------------------------------------

/**
 * Copies the kit into `outDir` according to `answers`.
 *
 * @returns every path written, relative to `outDir`.
 */
export function copyKit(kitRoot, outDir, answers) {
  // Outside the try on purpose: here the directory's contents are the developer's, not ours.
  assertEmptyTarget(outDir, answers.dir)
  const preexisting = existsSync(outDir)
  try {
    return copyInto(kitRoot, outDir, answers)
  } catch (err) {
    rollbackTarget(outDir, preexisting, err)
    throw err
  }
}

// Clears a half-written target, so the next run doesn't blame the developer for the tool's debris.
// Exported because `cli/index.mjs` uses one rollback for both phases. The target was proved empty
// first, so everything in it is ours. The directory itself goes only if this tool created it.
export function rollbackTarget(outDir, preexisting, cause) {
  try {
    if (!existsSync(outDir)) return
    if (!preexisting) rmSync(outDir, { recursive: true, force: true })
    else {
      for (const name of readdirSync(outDir)) {
        rmSync(join(outDir, name), { recursive: true, force: true })
      }
    }
  } catch (err) {
    // Reported next to the real failure, never instead of it.
    cause.message += `\n  (cleaning up '${outDir}' also failed: ${err.message} — remove it by hand)`
  }
}

// --- one layout per block -----------------------------------------------------------------------

// Assets only one layout uses. Without that layout, the asset and the copy lines that point at it
// are left out.
const LAYOUT_ASSETS = [
  {
    block: 'hero',
    layout: 'split',
    asset: 'public/hero.jpg',
    copyLine: /^ {2}image: \{ src: '\/hero\.jpg',.*\n/gm,
  },
]

/** The layout-only assets this project doesn't use. Throws if one is missing from the kit. */
function unusedAssets(kitRoot, answers) {
  const unused = new Set()
  for (const a of LAYOUT_ASSETS) {
    if (!existsSync(kitPath(kitRoot, a.asset))) throw new Error(`Kit is missing '${a.asset}'`)
    if (!answers.blocks.includes(a.block) || answers.variants?.[a.block] !== a.layout) {
      unused.add(a.asset)
    }
  }
  return unused
}

// A project gets only the layout it picked. `block.ts` and `variants.ts` are rewritten to name that
// one layout, which also becomes the default, and the other layouts' files are not copied.
function pickVariant(kitRoot, id, chosen) {
  const dir = blockDir(id)
  const blockRel = `${dir}/block.ts`
  const variantsRel = `${dir}/variants.ts`
  let block = readKitFile(kitRoot, blockRel)
  let variants = readKitFile(kitRoot, variantsRel)

  const names = block.match(/^const variantNames = \[[^\]]*\] as const$/gm)
  const def = block.match(/^ {2}defaultVariant: '(\w+)',$/gm)
  if (names?.length !== 1 || def?.length !== 1) {
    throw new Error(
      `${blockRel}: expected one \`variantNames\` line and one \`defaultVariant\` line`,
    )
  }
  const variant = chosen ?? def[0].match(/'(\w+)'/)[1]

  const entries = [...variants.matchAll(/^ {2}(\w+): (\w+),$/gm)]
  if (!entries.some((m) => m[1] === variant)) {
    throw new Error(`${variantsRel}: no '${variant}' entry in the variants object`)
  }
  const skip = new Set([blockRel, variantsRel])
  for (const [line, name, component] of entries) {
    if (name === variant) continue
    const imp = variants.match(
      new RegExp(`^import \\{ ${component} \\} from '\\./([\\w-]+)'\\n`, 'm'),
    )
    if (!imp) throw new Error(`${variantsRel}: no import line for ${component}`)
    variants = replaceExactText(variants, variantsRel, imp[0], '')
    variants = replaceExactText(variants, variantsRel, `${line}\n`, '')
    skip.add(`${dir}/${imp[1]}.tsx`)
  }

  const files = {}
  for (const a of LAYOUT_ASSETS) {
    if (a.block !== id || a.layout === variant) continue
    const copyRel = `${dir}/copy.ts`
    const copy = readKitFile(kitRoot, copyRel)
    if (!copy.match(a.copyLine)) throw new Error(`${copyRel}: no line pointing at ${a.asset}`)
    files[copyRel] = copy.replace(a.copyLine, '')
    skip.add(copyRel)
  }

  block = block
    .replace(names[0], `const variantNames = ['${variant}'] as const`)
    .replace(def[0], `  defaultVariant: '${variant}',`)
  files[blockRel] = block
  files[variantsRel] = variants
  return { skip, files }
}

function copyInto(kitRoot, outDir, answers) {
  // Before anything is created, and for every answer: the leak these catch hurts non-admin
  // projects most.
  assertAdminPathsExist(kitRoot)
  assertPanelStaysInItsRoots(kitRoot)

  const written = []
  const presetFile = `${PRESET_DIR}/${answers.preset}.css`
  // A transformed file also sits in a copied tree; skipping it here avoids writing it twice.
  // `isAdminPath` filters the panel's routes out of `src/routes`. Both live in `keep`, so every
  // copy path gets them.
  const wantsAdmin = answers.backend === 'admin'
  const unused = unusedAssets(kitRoot, answers)
  const keep = (rel) =>
    !TRANSFORMED_FILES.includes(rel) && !unused.has(rel) && (wantsAdmin || !isAdminPath(rel))

  mkdirSync(outDir, { recursive: true })

  for (const dir of COPY_DIRS) {
    // Composed with `keep`, not replacing it.
    if (dir === PRESET_DIR) {
      copyTree(kitRoot, outDir, dir, written, (rel) => keep(rel) && rel === presetFile)
    } else copyTree(kitRoot, outDir, dir, written, keep)
  }
  // The filter above cannot tell "no such preset" from "filtered everything out" on its own.
  if (!written.includes(presetFile)) {
    throw new Error(`Kit has no preset '${answers.preset}' — ${presetFile} is missing`)
  }

  // The panel's own tree, only for `admin`. Without this gate a non-admin project would import
  // packages its `package.json` doesn't list, and the build would fail.
  if (answers.backend === 'admin') {
    for (const dir of ADMIN_COPY_DIRS) copyTree(kitRoot, outDir, dir, written, keep)
  }

  // Every copy path is composed with `keep`, so a transformed file is never also copied verbatim.
  for (const rel of COPY_FILES) {
    if (keep(rel)) copyOne(kitRoot, outDir, rel, written)
  }
  for (const id of answers.blocks) {
    const { skip, files } = pickVariant(kitRoot, id, answers.variants?.[id])
    copyTree(kitRoot, outDir, blockDir(id), written, (rel) => keep(rel) && !skip.has(rel))
    for (const [rel, text] of Object.entries(files)) writeOut(outDir, rel, text, written)
  }
  for (const choice of Object.values(BOUNDARY_FILES)) {
    const rel = typeof choice === 'function' ? choice(answers) : choice
    if (keep(rel)) copyOne(kitRoot, outDir, rel, written)
  }

  for (const rel of TRANSFORMED_FILES) {
    const transform = TRANSFORMS[rel]
    if (!transform) throw new Error(`No transform registered for '${rel}'`)
    assertCopyable(rel)
    writeOut(outDir, rel, transform(readKitFile(kitRoot, rel), answers), written)
  }

  // Only when a backend was chosen. `?? 'none'` covers callers that build `answers` by hand.
  if ((answers.backend ?? 'none') !== 'none') copyApiTree(kitRoot, outDir, written)

  return written
}
