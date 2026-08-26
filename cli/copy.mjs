// The copy layer: kit files in, project files out. Everything here is verbatim or a named,
// exact-match edit — nothing is generated. Generation is the next layer's job.
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
import { dirname, join } from 'node:path'
import {
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
  kitPath,
  NEVER_COPY,
  NEVER_COPY_ANYWHERE,
  PRESET_DIR,
  TRANSFORMED_FILES,
} from './kit-manifest.mjs'

// --- the three README sections a generated project must not claim to have --------------------
// Each is named once and used three times over: removed from the body, from the `## Contents`
// list, and from /docs' RECIPES array. `check-conventions.mjs` ships to the generated project and
// checks all three against each other, so a partial removal fails the project's own `pnpm
// conventions` rather than shipping a dangling anchor.
// Empty, and by design. Every section that a generated project must not claim to have is now
// either absent from README.md entirely — the maintainer-only material lives in MAINTAINERS.md,
// which is not in `package.json`'s `files` — or listed in DROPPED_SECTIONS_README_ONLY below.
//
// This list is the one whose entries must ALSO be `RECIPES` entries in
// `src/components/docs/config-reference.tsx`: `transformConfigReference` iterates it and throws
// when a heading has no matching RECIPES line. Kept as the seam for the next section that is both
// a README section and a /docs recipe.
const DROPPED_SECTIONS = []

// Dropped from the README exactly like the list above, but NOT from `RECIPES`, because they were
// never in it. `transformConfigReference` iterates `DROPPED_SECTIONS` and throws when an entry has
// no matching RECIPES line, so adding either of these there would make every scaffold fail on a
// heading that was correctly never listed. Two lists, one difference: RECIPES membership.
const DROPPED_SECTIONS_README_ONLY = [
  // How to create a project, aimed at someone who has not created one yet. A generated project
  // already exists, so its README opens on `## Running it` instead.
  'Create your site',
  // The remaining CLI flags, for a project that does not contain the CLI.
  'Scaffolding options',
  // Points at MAINTAINERS.md, which is not in `files` — so in a generated project the link would
  // be dead and the subject irrelevant.
  'Working on the kit itself',
]

// Scripts that do not exist in a generated `package.json`, so their rows describe nothing.
//
// Empty since `smoke:*` and `lighthouse*` moved out of `package.json` into `tools/kit.mjs`: the
// kit's README no longer documents them as `pnpm` scripts, so there is no row left to remove.
// Kept as the seam rather than deleted, because the next kit-only script added to the Scripts
// table needs exactly this list — and `dropRowIn` throws when a named row is absent, so a stale
// entry here would fail every scaffold rather than pass one quietly.
const DROPPED_SCRIPTS = []

// Kit-only prose that is NOT a whole section, and so survives the section drops above.
//
// Empty, and that is the design rather than an accident. Every kit-only claim in the README lives
// inside one of the five dropped sections, so removing those sections is the whole job. The list
// was long when kit-only facts were scattered through surviving prose — each one an exact string
// that broke whenever anyone reworded a sentence near it.
//
// Kept as the seam: `replaceExactText` throws on a miss AND on an ambiguity, so a stale entry
// fails every scaffold loudly instead of passing one quietly. Add here only when a kit-only fact
// genuinely cannot be moved into a dropped section.
const README_EDITS = []

// --- guards -----------------------------------------------------------------------------------

// Overwriting a developer's work silently is the worst thing this tool could do, so "exists" is
// not the test — "has anything in it" is. Dotfiles count: a `.git` in there means it is someone's
// repository, not an empty slot. A non-directory gets its own message rather than the raw
// `ENOTDIR` `readdirSync` would otherwise surface: it is the same do-not-clobber case.
function assertEmptyTarget(outDir, label) {
  if (!existsSync(outDir)) return
  if (!statSync(outDir).isDirectory()) {
    throw new Error(`Target '${label}' already exists and is not a directory`)
  }
  if (readdirSync(outDir).length > 0) {
    throw new Error(`Target directory '${label}' already exists and is not empty`)
  }
}

// The manifest says what to copy; this says what may never be copied whatever the manifest says.
// NEVER_COPY is anchored at the root and NEVER_COPY_ANYWHERE matches any segment — see the
// manifest for why the two cannot be one list.
//
// API_STATIC_DIST and API_STATIC_PLACEHOLDER are checked first and by exact match, not by segment:
// the walk needs to descend into internal/static/dist (so the directory path itself must clear this
// check) and then copy exactly one file out of it. Everything else in that directory still falls
// through to the NEVER_COPY_ANYWHERE loop below and is refused, same as any other stray `dist`.
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

// `keep` is per-file, so a directory is never pruned wholesale by accident — `src/styles/presets`
// is the only filtered entry and it has no subdirectories.
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
//
// Mirrors copyOne/copyTree above, with two differences: the source root is apiPath, not kitPath,
// and every destination is joined under API_DEST. Kept as separate functions rather than an extra
// parameter on copyOne/copyTree, because those two are also called for the web tree with `rel`
// used unmodified as the destination — threading a dest-prefix through them would make every call
// site carry a value that is empty except here.

function copyOneApi(kitRoot, outDir, rel, written) {
  assertCopyable(rel)
  const src = apiPath(kitRoot, rel)
  if (!existsSync(src)) {
    throw new Error(`Kit is missing 'apps/api/${rel}' — cannot scaffold a backend without it`)
  }
  const destRel = `${API_DEST}/${rel}`
  const dest = join(outDir, destRel)
  mkdirSync(dirname(dest), { recursive: true })
  // Byte copy, not a read-and-write: matches copyOne, and nothing in the API tree is transformed.
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

// Line indices of the real '## ' headings. Fence-aware, because a section's extent is decided by
// where the *next* heading is: a fenced block containing a line like '## Contents' would otherwise
// end the section early and leave the rest of it behind as orphan prose — and that failure is
// silent, since the heading being removed was found. Everything else in this file throws on a
// miss; this was the one path that could quietly do the wrong thing instead.
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

// Exact heading match, never a fuzzy one, and a miss throws. A silent no-op here ships a README
// describing features the project does not have, and nothing downstream would notice.
function dropSection(lines, heading) {
  const [start, end] = sectionRange(
    lines,
    heading,
    'it was renamed or already gone, and a generated project would keep a section describing ' +
      'something it does not have',
  )
  lines.splice(start, end - start)
}

// Every row removal is scoped to the section holding its table. Searching the whole file would
// find the first line that happens to start the same way, and a table-row removal that hits the
// wrong table is exactly the silent wrong result the fence handling above exists to prevent.
function dropRowIn(lines, heading, prefix, why) {
  const [start, end] = sectionRange(lines, heading, `cannot find the table to edit (${why})`)
  const at = lines.findIndex((l, i) => i > start && i < end && l.startsWith(prefix))
  if (at === -1) throw new Error(`README.md: no '${prefix}…' row under '## ${heading}' — ${why}`)
  lines.splice(at, 1)
}

// Scoped to the Contents block on purpose: the same bracketed text appears as an inline link in
// the body, and removing that would leave a sentence with a hole in it.
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

// A miss throws, and so does a second match: an edit that could land in either of two places is
// not the exact replacement this file claims to make.
function replaceExactText(text, file, from, to) {
  const at = text.indexOf(from)
  // The first NON-EMPTY line, truncated: an edit whose match starts at a line break (removing a
  // list item takes the newline before it, so the whole item goes and no blank line is left) has
  // an empty first line, and reported `expected text not found:` with nothing after it — a throw
  // that fires but says nothing is barely better than one that does not fire.
  const first = from.split('\n').find((l) => l !== '') ?? from
  const shown = first.length > 90 ? `${first.slice(0, 90)}…` : first
  if (at === -1) throw new Error(`${file}: expected text not found: ${shown}`)
  if (text.indexOf(from, at + from.length) !== -1) {
    throw new Error(`${file}: expected text is not unique, so the edit is ambiguous: ${shown}`)
  }
  return text.slice(0, at) + to + text.slice(at + from.length)
}

function transformReadme(text) {
  const lines = text.split('\n')
  for (const heading of [...DROPPED_SECTIONS, ...DROPPED_SECTIONS_README_ONLY]) {
    dropContentsEntry(lines, heading)
    dropSection(lines, heading)
  }
  for (const script of DROPPED_SCRIPTS) {
    dropRowIn(
      lines,
      'Scripts',
      `| \`pnpm ${script}\` |`,
      `a generated package.json has no '${script}' script`,
    )
  }
  // No row drops here any more: the README's own tables describe only directories a generated
  // project actually has. `configs/` and `tools/` used to appear in an architecture table and
  // each needed removing by hand.

  // Prose edits run last, over the joined text, so the structural removals above cannot disturb
  // them. Currently a no-op — see README_EDITS.
  let out = lines.join('\n')
  for (const [from, to] of README_EDITS) out = replaceExactText(out, 'README.md', from, to)
  // Cutting the final section leaves the blank line that separated it; one trailing newline.
  return `${out.replace(/\n+$/, '')}\n`
}

// --- src/styles/theme.css ---------------------------------------------------------------------

// `replacement === null` deletes the line. Either way a miss throws: a preset import left pointing
// at `editorial.css` when the answer was `warm` is a build that succeeds and looks wrong.
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
  // `configs/` is never copied, and Tailwind's `@source` scan of a path that does not exist is a
  // silent no-op — the kind of leftover that survives for years.
  replaceExactLine(lines, file, '@source "../../configs/**/*.{ts,tsx}";', null)
  // And the paragraph justifying that line goes with it. A comment explaining code that is not
  // there is worse than no comment: the next reader looks for the `@source` it describes, does not
  // find it, and has to work out which of the two is wrong.
  return replaceExactText(
    lines.join('\n'),
    file,
    '   here: `.css` is outside the globs below.)\n\n' +
      '   Both source trees are listed: `KIT_CONFIG=onepage` is a supported build and must not ' +
      'lose\n   styles from a config that renders a class. */',
    '   here: `.css` is outside the globs below.) */',
  )
}

// --- src/components/docs/config-reference.tsx ---------------------------------------------------

function transformConfigReference(text) {
  const file = 'src/components/docs/config-reference.tsx'
  const lines = text.split('\n')
  for (const entry of DROPPED_SECTIONS) {
    // The array elements are one string literal per line; matching the trailing comma too keeps
    // this from hitting a prefix of some other entry.
    const at = lines.findIndex((l) => l.trim() === `'${entry}',`)
    if (at === -1) {
      throw new Error(
        `${file}: no RECIPES entry '${entry}' — /docs would keep pointing readers at a README ` +
          'section this project does not have',
      )
    }
    lines.splice(at, 1)
  }
  return lines.join('\n')
}

// --- the surviving half of each boundary pair ---------------------------------------------------

// The kit ships two implementations behind each of `@/motion`, `@/theme` and `@/submit`, and
// `vite.config.ts` swaps between them on an env flag. A generated project gets exactly one, chosen
// at scaffold time and baked into `vite.config.ts` and `tsconfig.json` — there is no flag left to
// flip. So every sentence in the surviving half that explains itself by reference to the other one
// describes machinery that is not there, which is the rule Task 4 applied to the README.
//
// Each edit is exact-match and throws on a miss or an ambiguity, via `replaceExactText`. The
// `file` label is per-EDIT rather than per-file wherever one file has two edits whose first line
// could be confused, because the thrown message quotes that first line to say what failed.

function transformMotionAnimated(text) {
  // Only the module-contract note needs rewriting. The LCP note above it used to point at the
  // `## Lighthouse budget` README section; it now says "measure LCP first", which is true in a
  // generated project too, so there is nothing left to edit there.
  return replaceExactText(
    text,
    'src/integrations/motion.animated.tsx (module contract)',
    '// Type-checks this file against the shared `@/motion` surface, so the two variants cannot drift\n' +
      '// apart. `tsconfig` points `@/motion` at this file only, which is why motion.noop.tsx needs the\n' +
      '// same line: without it, `KIT_ANIMATION=off` is the one setup nothing type-checks.',
    '// Type-checks this file against the shared `@/motion` surface. Nothing else does: a caller\n' +
      '// only checks the exports it imports, so a missing export would compile until something\n' +
      '// reached for it.',
  )
}

function transformSubmitEndpoint(text) {
  const file = 'src/integrations/submit.endpoint.ts'
  const out = replaceExactText(
    text,
    `${file} (schema note)`,
    '  // Same schema the RPC variant validates, so neither mode is the weaker one.',
    '  // Validated before anything is sent, so a malformed submission never reaches the endpoint.',
  )
  return replaceExactText(
    out,
    `${file} (module contract)`,
    '// Type-checks this file against the shared `@/submit` surface, so the two variants cannot drift\n' +
      '// apart. `tsconfig` points `@/submit` at one variant only, so without this line the other one\n' +
      '// (`KIT_SUBMIT=server`) is the setup nothing type-checks.',
    '// Type-checks this file against the shared `@/submit` surface. Nothing else does: a caller\n' +
      '// only checks the exports it imports, so a missing export would compile until something\n' +
      '// reached for it.',
  )
}

function transformSubmitSchema(text) {
  const file = 'src/integrations/submit-schema.ts'
  const out = replaceExactText(
    text,
    `${file} (wire note)`,
    ' * What goes over the wire, validated by both submit variants.',
    ' * What goes over the wire.',
  )
  return replaceExactText(
    out,
    `${file} (module contract)`,
    ' * The exact surface every `@/submit` variant must have. `tsconfig` names only one variant, so\n' +
      ' * without this the other is never type-checked. Same rule as `@/motion` and `@/theme`.',
    ' * The exact surface `@/submit` must have. Same rule as `@/motion` and `@/theme`.',
  )
}

// --- biome.json ---------------------------------------------------------------------------------

// `noRestrictedImports` is a live rule, not inert configuration, which is exactly why the dead
// entries matter: an entry naming a module that resolves to no file can never fire, because
// `import … from '@/motion.noop'` is already a "cannot find module" type error before Biome sees
// it. What it does do is tell a developer reading the lint config that this project has a
// `motion.noop` and a `submit.rpc`. It has neither. Both theme entries stay: a generated project
// really does contain both halves, so those two bans are live.
//
// The entries naming files that DID ship are kept, and they are the valuable ones: those imports
// resolve, so without the rule a direct import would silently bypass the alias.
//
// The theme pair is kept verbatim. Only `@/submit.rpc` goes, and it is not the last entry in its
// object, so removing it cannot leave a dangling comma.
const BIOME_INDENT = ' '.repeat(18)
const themeRule = (half) =>
  `${BIOME_INDENT}"@/integrations/theme.${half}": "Import '@/theme' — the alias selects the implementation."`

function transformBiomeJson(text) {
  const file = 'biome.json'
  // `vcs.root` points Biome at the repo root, where the kit keeps its `.gitignore`, two levels up
  // from `apps/web/biome.json`. A generated project is flat, so its `.gitignore` sits beside this
  // file and the same key would send Biome outside the project. Removed rather than rewritten:
  // the default is already correct once the two files are siblings.
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
  // Anchored on the theme pair, which appears in both overrides: `@/submit.rpc` follows only
  // here, so the three lines together are unique while the submit line alone is not.
  out = replaceExactText(
    out,
    `${file} (blocks override)`,
    `${themeRule('both')},\n${themeRule('single')},\n` +
      `${BIOME_INDENT}"@/integrations/submit.rpc": "Import '@/submit' — the alias selects the implementation.",\n`,
    `${themeRule('both')},\n${themeRule('single')},\n`,
  )

  // The edits above are line surgery on a file whose last-entry-has-no-comma rule they have to
  // respect. Getting that wrong ships a `biome.json` that Biome cannot parse, which fails the
  // generated project's `pnpm lint` with a message about syntax rather than about this. Cheap to
  // rule out here, and it also catches a kit whose biome.json was already broken by hand.
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

const TRANSFORMS = {
  'README.md': transformReadme,
  'src/styles/theme.css': transformThemeCss,
  'src/components/docs/config-reference.tsx': transformConfigReference,
  'src/integrations/motion.animated.tsx': transformMotionAnimated,
  'src/integrations/submit.endpoint.ts': transformSubmitEndpoint,
  'src/integrations/submit-schema.ts': transformSubmitSchema,
  'biome.json': transformBiomeJson,
}

// --- the copier -------------------------------------------------------------------------------

/**
 * Copies the kit into `outDir` according to `answers`.
 *
 * @returns every path written, relative to `outDir`.
 */
export function copyKit(kitRoot, outDir, answers) {
  // Outside the try below on purpose: this is the one failure where the contents of `outDir` are
  // the developer's, and cleaning up after it would delete exactly what it exists to protect.
  assertEmptyTarget(outDir, answers.dir)
  const preexisting = existsSync(outDir)
  try {
    return copyInto(kitRoot, outDir, answers)
  } catch (err) {
    rollbackTarget(outDir, preexisting, err)
    throw err
  }
}

// A half-written target is worse than no target: the next run hits `assertEmptyTarget` and reports
// that the developer's directory already has contents, blaming them for the tool's own debris and
// never mentioning the `rm -rf` that recovery needs. Any mid-copy failure reaches this — a
// truncated tarball, ENOSPC, EACCES on one file.
//
// Exported because the generate layer writes into the same directory afterwards, and a failure
// there leaves exactly the same debris with exactly the same misleading message on the next run.
// `cli/index.mjs` owns one rollback spanning both phases; this is it.
//
// The target's contents are cleared wholesale rather than by replaying the written list, because
// the written list is not the full record: `mkdirSync(…, { recursive: true })` creates directories
// nobody logged, and a `copyFileSync` that dies part-way leaves a truncated file that was never
// pushed. `assertEmptyTarget` proved the directory empty before the first write, so everything in
// it now is ours and clearing it is exact. The directory itself goes only if this tool created it:
// an empty directory the developer made is theirs to keep.
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
    // Reported alongside the real failure, never instead of it — the original error is the one
    // worth acting on, and a cleanup that failed is only a footnote telling you to finish by hand.
    cause.message += `\n  (cleaning up '${outDir}' also failed: ${err.message} — remove it by hand)`
  }
}

function copyInto(kitRoot, outDir, answers) {
  const written = []
  const presetFile = `${PRESET_DIR}/${answers.preset}.css`
  // A transformed file also lives inside a copied tree; taking it here would mean writing it twice
  // and depending on the order of the two writes for correctness.
  const keep = (rel) => !TRANSFORMED_FILES.includes(rel)

  mkdirSync(outDir, { recursive: true })

  for (const dir of COPY_DIRS) {
    // Composed, not replaced: an un-composed filter here is the same double-write hazard `keep`
    // exists to remove, kept alive in one branch.
    if (dir === PRESET_DIR) {
      copyTree(kitRoot, outDir, dir, written, (rel) => keep(rel) && rel === presetFile)
    } else copyTree(kitRoot, outDir, dir, written, keep)
  }
  // The filter above cannot tell "no such preset" from "filtered everything out" on its own.
  if (!written.includes(presetFile)) {
    throw new Error(`Kit has no preset '${answers.preset}' — ${presetFile} is missing`)
  }

  // Every copy path is composed with `keep`, not just the tree walk. A transformed file reached
  // through any of them would be copied verbatim and then rewritten a moment later, leaving
  // correctness to depend on which write lands last. `src/integrations/submit.endpoint.ts`
  // arrives via BOUNDARY_FILES, so this is not hypothetical. (`biome.json` is TRANSFORMED_FILES
  // only, never COPY_FILES, so it never reaches this loop at all.)
  for (const rel of COPY_FILES) {
    if (keep(rel)) copyOne(kitRoot, outDir, rel, written)
  }
  for (const id of answers.blocks) copyTree(kitRoot, outDir, blockDir(id), written, keep)
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

  // Only when a backend was asked for: with no backend, this whole tree is absent rather than
  // filtered down to nothing. `?? 'none'` is belt-and-braces: `cli/prompts.mjs` always sets
  // `answers.backend` now, so this only matters for a caller that builds an `answers` object by
  // hand rather than through `resolveAnswers` — which is exactly how this function's own tests do
  // it, and how a future one might too.
  if ((answers.backend ?? 'none') !== 'none') copyApiTree(kitRoot, outDir, written)

  return written
}
