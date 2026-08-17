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
  BOUNDARY_FILES,
  blockDir,
  COPY_DIRS,
  COPY_FILES,
  IGNORED_NAMES,
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

// The rest of the README's kit-only machinery: prose, not whole sections. Removing the three
// sections above is not enough on its own — it leaves the intro promising env flags, an
// architecture row for a `configs/` directory that is never copied, and two anchors
// (`#the-three-env-flags`, `#lighthouse-budget`) pointing at headings that no longer exist. The
// generated project's `check-conventions.mjs` gate only sees the Contents list, so it would pass
// with both broken links in the body.
//
// Several of these span two lines. Matched against the whole text rather than line by line for
// exactly that reason, and each one throws when absent or ambiguous.
const README_EDITS = [
  [
    '**swapping config files and env flags — never by editing components**',
    '**swapping config files — never by editing components**',
  ],
  ["type-check, including `configs/` (added to `tsconfig.json`'s `include`).", 'type-check.'],
  [
    'in `pages.config.ts` (`configs/<name>/pages.config.ts` or\n  `src/config/pages.config.ts`)',
    'in `src/config/pages.config.ts`',
  ],
  [
    'resolved in `vite.config.ts` based on an\n  env flag, never on an `if` inside a component: ' +
      '`@/motion`, `@/theme`, `@/submit`. See\n  [The three env flags](#the-three-env-flags).',
    'resolved in `vite.config.ts`, never an\n  `if` inside a component: `@/motion`, `@/theme`, ' +
      '`@/submit`.',
  ],
  ['for this reason; see [Lighthouse budget](#lighthouse-budget) for why.', 'for this reason.'],
  ['  none of the JS. Same for `KIT_ANIMATION=off` and the `motion` library.', '  none of the JS.'],
  [
    "`/` (Lighthouse CI's own static server, used by `pnpm lighthouse`, is exactly this). Without",
    '`/`. Without',
  ],

  // Second pass over the same rule, after a scaffold was generated and grepped rather than
  // reasoned about: the list above was an enumeration of "every kit-only reference", and an
  // enumeration is only as complete as the reading that produced it. These six survived it —
  // the two smoke scripts, the alias pairs named by filename (the unshipped half of each is not
  // there, and under `--theme=single` neither is `theme.both.tsx`), the one-page smoke config,
  // two Lighthouse measurements a scaffold cannot reproduce, and a gotcha about naming
  // `submit.rpc.ts`, a file the scaffold does not have.
  [
    '`node scripts/verify-build.mjs` (run by both `verify` and the two smoke scripts) reads',
    '`node scripts/verify-build.mjs` (run by `verify`) reads',
  ],
  [
    '| flat `src/` files | Alternate implementations behind an alias — ' +
      '`motion.animated.tsx`/`motion.noop.tsx`, `theme.both.tsx`/`theme.single.tsx`, ' +
      "`submit.rpc.ts`/`submit.endpoint.ts` — each pair a swap target for `vite.config.ts`'s " +
      '`resolve.alias`, never a component or a lib, which is why neither half lives in either ' +
      'bucket. |',
    '| flat `src/` files | The implementations behind an alias — motion, theme and submit — ' +
      "each resolved by `vite.config.ts`'s `resolve.alias`, never a component or a lib, " +
      'which is why none of them lives in either bucket. |',
  ],
  ['    config — this is the mechanism the one-page smoke config exercises.', '    config.'],
  [
    '  chroma. Measured Lighthouse accessibility is **1.00** on both locales, both presets, ' +
      'mobile and\n  desktop.',
    '  chroma.',
  ],
  [
    'both `pnpm verify` and Lighthouse stay green — the accessibility audit measures ' +
      'contrast, not\nwhether a focus ring resolved.',
    '`pnpm verify` stays green — nothing it checks can see whether a focus ring resolved.',
  ],
  [
    '\n- **`submit.rpc.ts` is deliberately not named `submit.server.ts`.** TanStack ' +
      "Start's client-import\n  protection refuses to bundle any `**/*.server.*` file into " +
      'the client by filename, regardless of\n  content. This file is the sanctioned ' +
      'client-safe `createServerFn` stub the client is meant to\n  import, so renaming keeps ' +
      'the protection intact for every *other* file instead of carving out an\n  exception ' +
      'that the next person copying this pattern could get wrong.',
    '',
  ],
]

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
function assertCopyable(rel) {
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
    if (IGNORED_NAMES.includes(entry.name)) continue
    const childRel = `${rel}/${entry.name}`
    if (entry.isDirectory()) copyTree(kitRoot, outDir, childRel, written, keep)
    else if (keep(childRel)) copyOne(kitRoot, outDir, childRel, written)
  }
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
  for (const heading of DROPPED_SECTIONS) {
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
  dropRowIn(
    lines,
    'Architecture in one page',
    '| `configs/` |',
    'a generated project has no `configs/` directory',
  )

  // Prose edits run last, over the joined text: three of them span two lines, and all of them sit
  // in sections that survive, so the structural removals above cannot disturb them.
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
  // Outside the try below on purpose: this is the one failure where the contents of `outDir` are
  // the developer's, and cleaning up after it would delete exactly what it exists to protect.
  assertEmptyTarget(outDir, answers.dir)
  const preexisting = existsSync(outDir)
  try {
    return copyInto(kitRoot, outDir, answers)
  } catch (err) {
    rollback(outDir, preexisting, err)
    throw err
  }
}

// A half-copied target is worse than no target: the next run hits `assertEmptyTarget` and reports
// that the developer's directory already has contents, blaming them for the tool's own debris and
// never mentioning the `rm -rf` that recovery needs. Any mid-copy failure reaches this — a
// truncated tarball, ENOSPC, EACCES on one file.
//
// The target's contents are cleared wholesale rather than by replaying the written list, because
// the written list is not the full record: `mkdirSync(…, { recursive: true })` creates directories
// nobody logged, and a `copyFileSync` that dies part-way leaves a truncated file that was never
// pushed. `assertEmptyTarget` proved the directory empty before the first write, so everything in
// it now is ours and clearing it is exact. The directory itself goes only if this tool created it:
// an empty directory the developer made is theirs to keep.
function rollback(outDir, preexisting, cause) {
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
