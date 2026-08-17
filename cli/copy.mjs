// The copy layer: kit files in, project files out. Everything here is verbatim or a named,
// exact-match edit — nothing is generated. Generation is the next layer's job.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import {
  BOUNDARY_FILES,
  blockDir,
  COPY_DIRS,
  COPY_FILES,
  NEVER_COPY,
  PRESET_DIR,
  TRANSFORMED_FILES,
} from './kit-manifest.mjs'

// --- the three README sections a generated project must not claim to have --------------------
// Each is named once and used three times over: removed from the body, from the `## Contents`
// list, and from /docs' RECIPES array. `check-conventions.mjs` ships to the generated project and
// checks all three against each other, so a partial removal fails the project's own `pnpm
// conventions` rather than shipping a dangling anchor.
const DROPPED_SECTIONS = [
  // Generated projects get a static `vite.config.ts` with no KIT_* branching.
  'The three env flags',
  // `configs/` is never copied.
  'Swapping the whole config: `configs/`',
  // Lighthouse is deliberately not shipped (spec §2).
  'Lighthouse budget',
]

// Scripts that do not exist in a generated `package.json`, so their rows describe nothing.
const DROPPED_SCRIPTS = ['smoke:full', 'smoke:onepage', 'lighthouse', 'lighthouse:desktop']

// --- guards -----------------------------------------------------------------------------------

// Overwriting a developer's work silently is the worst thing this tool could do, so "exists" is
// not the test — "has anything in it" is. Dotfiles count: a `.git` in there means it is someone's
// repository, not an empty slot.
function assertEmptyTarget(outDir, label) {
  if (!existsSync(outDir)) return
  if (readdirSync(outDir).length > 0) {
    throw new Error(`Target directory '${label}' already exists and is not empty`)
  }
}

// The manifest says what to copy; this says what may never be copied whatever the manifest says.
function assertCopyable(rel) {
  const top = rel.split('/')[0]
  if (NEVER_COPY.includes(top)) {
    throw new Error(`Refusing to copy '${rel}': '${top}' is in NEVER_COPY`)
  }
}

// --- primitives -------------------------------------------------------------------------------

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

function copyOne(kitRoot, outDir, rel, written) {
  assertCopyable(rel)
  const src = join(kitRoot, rel)
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
  const src = join(kitRoot, rel)
  if (!existsSync(src)) throw new Error(`Kit is missing '${rel}/' — cannot scaffold without it`)
  const entries = readdirSync(src, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )
  for (const entry of entries) {
    const childRel = `${rel}/${entry.name}`
    if (entry.isDirectory()) copyTree(kitRoot, outDir, childRel, written, keep)
    else if (keep(childRel)) copyOne(kitRoot, outDir, childRel, written)
  }
}

// --- README.md --------------------------------------------------------------------------------

// Exact heading match, never a fuzzy one, and a miss throws. A silent no-op here ships a README
// describing features the project does not have, and nothing downstream would notice.
function dropSection(lines, heading) {
  const start = lines.findIndex((l) => l.trimEnd() === `## ${heading}`)
  if (start === -1) {
    throw new Error(
      `README.md: no '## ${heading}' heading to remove — it was renamed or already gone, and a ` +
        'generated project would keep a section describing something it does not have',
    )
  }
  // To the line before the next '## ', or to the end of the file for the last section.
  const after = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  lines.splice(start, (after === -1 ? lines.length : after) - start)
}

// Scoped to the Contents block on purpose: the same bracketed text appears as an inline link in
// the body, and removing that would leave a sentence with a hole in it.
function dropContentsEntry(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === '## Contents')
  if (start === -1) throw new Error("README.md: no '## Contents' heading — cannot trim its list")
  const after = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  const end = after === -1 ? lines.length : after
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

function dropScriptRow(lines, script) {
  const prefix = `| \`pnpm ${script}\` |`
  const at = lines.findIndex((l) => l.startsWith(prefix))
  if (at === -1) {
    throw new Error(
      `README.md: no Scripts row for 'pnpm ${script}' — a generated package.json has no such ` +
        'script, so the row must be removed and could not be found',
    )
  }
  lines.splice(at, 1)
}

function transformReadme(text) {
  const lines = text.split('\n')
  for (const heading of DROPPED_SECTIONS) {
    dropContentsEntry(lines, heading)
    dropSection(lines, heading)
  }
  for (const script of DROPPED_SCRIPTS) dropScriptRow(lines, script)
  // Cutting the final section leaves the blank line that separated it; one trailing newline.
  return `${lines.join('\n').replace(/\n+$/, '')}\n`
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
  return lines.join('\n')
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

const TRANSFORMS = {
  'README.md': transformReadme,
  'src/styles/theme.css': transformThemeCss,
  'src/components/docs/config-reference.tsx': transformConfigReference,
}

// --- the copier -------------------------------------------------------------------------------

/**
 * Copies the kit into `outDir` according to `answers`.
 *
 * @returns every path written, relative to `outDir`.
 */
export function copyKit(kitRoot, outDir, answers) {
  assertEmptyTarget(outDir, answers.dir)

  const written = []
  const presetFile = `${PRESET_DIR}/${answers.preset}.css`
  // A transformed file also lives inside a copied tree; taking it here would mean writing it twice
  // and depending on the order of the two writes for correctness.
  const keep = (rel) => !TRANSFORMED_FILES.includes(rel)

  mkdirSync(outDir, { recursive: true })

  for (const dir of COPY_DIRS) {
    if (dir === PRESET_DIR) copyTree(kitRoot, outDir, dir, written, (rel) => rel === presetFile)
    else copyTree(kitRoot, outDir, dir, written, keep)
  }
  // The filter above cannot tell "no such preset" from "filtered everything out" on its own.
  if (!written.includes(presetFile)) {
    throw new Error(`Kit has no preset '${answers.preset}' — ${presetFile} is missing`)
  }

  for (const rel of COPY_FILES) copyOne(kitRoot, outDir, rel, written)
  for (const id of answers.blocks) copyTree(kitRoot, outDir, blockDir(id), written, keep)
  for (const choice of Object.values(BOUNDARY_FILES)) {
    copyOne(kitRoot, outDir, typeof choice === 'function' ? choice(answers) : choice, written)
  }

  for (const rel of TRANSFORMED_FILES) {
    const transform = TRANSFORMS[rel]
    if (!transform) throw new Error(`No transform registered for '${rel}'`)
    assertCopyable(rel)
    writeOut(outDir, rel, transform(readKitFile(kitRoot, rel), answers), written)
  }

  return written
}
