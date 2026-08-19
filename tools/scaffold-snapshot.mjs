#!/usr/bin/env node
/**
 * Proves the monorepo restructure changes nothing a scaffolded project sees.
 *
 * The kit has no unit tests, and the thing this phase must not break is ~90 generated files
 * across several answer combinations. A hand-read diff will not catch a copy-layer transform
 * that quietly stopped firing: the file is still written, just with the kit's own prose in it.
 *
 * So: hash every file of a real scaffold, per answer set, and compare. `record` writes the
 * baseline; `check` fails on any drift. Not in `package.json`'s `files`: this is maintainer
 * tooling, like the rest of `tools/`.
 *
 * Usage:  node tools/scaffold-snapshot.mjs record [variant]
 *         node tools/scaffold-snapshot.mjs check  [variant]
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const KIT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SNAP_DIR = join(KIT_ROOT, 'tools/__snapshots__')

/**
 * Four answer sets, chosen to reach every branch the copy and generate layers have:
 * both `theme` halves (which picks a boundary file AND edits biome.json and token-gallery),
 * both presets (which filters `src/styles/presets`), a block subset, and custom blocks
 * (which runs the add-block templates at scaffold time).
 *
 * `--yes` is on every set, including the ones that pass explicit flags. Not redundant: this runs
 * non-interactively, so a question left unanswered exits with "Input ended before every question
 * was answered", and a block subset leaves each block's LAYOUT question unanswered. An explicit
 * flag still wins over `--yes` (cli/prompts.mjs checks `flags[name]` first), so `--yes` only
 * fills the gaps the flags leave.
 *
 * `hero` requires `contact` and `cta` requires `contact` + `features`, so a subset that leaves
 * a link unresolved is refused by the CLI before it writes anything. The two subsets below are
 * both legal combinations.
 */
const VARIANTS = {
  default: ['--yes'],
  onepage: ['--yes', '--pages=one', '--theme=single', '--preset=warm', '--blocks=hero,contact'],
  custom: ['--yes', '--add-blocks=pricing,faq'],
  subset: ['--yes', '--blocks=features,contact', '--theme=single'],
}

/**
 * The one file whose bytes cannot be stable here, and the two fields that make it so:
 * `generatedAt` is the wall clock, and `answers.dir` is the scaffold target, which is a fresh
 * `mkdtemp` path on every call. Hashed raw, every variant reports drift on every run, for
 * reasons that have nothing to do with drift.
 *
 * Normalised rather than skipped. The rest of the file is `kitVersion` and the full answer set,
 * and a scaffold that stopped recording those is exactly the regression this tool exists to
 * catch, so the fix is to blank the two volatile fields, not to stop looking at the file.
 */
const SCAFFOLD_RECORD = '.kit/scaffold.json'

function normalise(rel, buf) {
  if (rel !== SCAFFOLD_RECORD) return buf
  // String substitution, not `JSON.parse` plus re-stringify. `generate.mjs` writes this file
  // with its own fits-or-expands formatter, and a round trip through `JSON.stringify` rewrites
  // every line of it. That would hide a change to that formatter behind a normalisation meant
  // only to hide a clock and a temp path. A pattern that stops matching leaves the raw value in
  // place, so this fails loudly rather than passing quietly.
  return Buffer.from(
    buf
      .toString('utf8')
      .replace(/"generatedAt": "[^"]*"/, '"generatedAt": "<normalised>"')
      .replace(/"dir": "[^"]*"/, '"dir": "<normalised>"'),
  )
}

function hashTree(dir) {
  const out = {}
  const walk = (rel) => {
    const entries = readdirSync(join(dir, rel), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) walk(childRel)
      else {
        const bytes = normalise(childRel, readFileSync(join(dir, childRel)))
        out[childRel] = createHash('sha256').update(bytes).digest('hex')
      }
    }
  }
  walk('')
  return out
}

/**
 * Scaffolds into a fresh temp directory and returns path -> sha256.
 *
 * The target's PARENT is the temp dir and not the kit, on purpose: `registerInWorkspace` writes
 * a `pnpm-workspace.yaml` beside the target, and pointing that at the kit's own workspace file
 * would have this tool edit the repo it is testing.
 */
function scaffold(args) {
  const tmp = mkdtempSync(join(tmpdir(), 'lk-snap-'))
  try {
    const out = join(tmp, 'site')
    const r = spawnSync(process.execPath, [join(KIT_ROOT, 'cli/index.mjs'), out, ...args], {
      encoding: 'utf8',
    })
    if (r.status !== 0) {
      throw new Error(`scaffold failed for '${args.join(' ')}':\n${r.stdout}\n${r.stderr}`)
    }
    return hashTree(out)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

function diff(expected, actual) {
  const problems = []
  for (const [path, hash] of Object.entries(expected)) {
    if (!(path in actual)) problems.push(`  missing   ${path}`)
    else if (actual[path] !== hash) problems.push(`  changed   ${path}`)
  }
  for (const path of Object.keys(actual)) {
    if (!(path in expected)) problems.push(`  new       ${path}`)
  }
  return problems.sort()
}

const [, , mode, only] = process.argv
if (mode !== 'record' && mode !== 'check') {
  console.error('Usage: node tools/scaffold-snapshot.mjs record|check [variant]')
  process.exit(2)
}
const names = only ? [only] : Object.keys(VARIANTS)
for (const name of names) {
  if (!VARIANTS[name])
    throw new Error(`No such variant '${name}'. Have: ${Object.keys(VARIANTS).join(', ')}`)
}

mkdirSync(SNAP_DIR, { recursive: true })
let failed = false
for (const name of names) {
  const file = join(SNAP_DIR, `${name}.json`)
  const actual = scaffold(VARIANTS[name])
  if (mode === 'record') {
    writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`)
    console.log(`recorded  ${name}  (${Object.keys(actual).length} files)`)
    continue
  }
  if (!existsSync(file))
    throw new Error(
      `No snapshot for '${name}'. Run: node tools/scaffold-snapshot.mjs record ${name}`,
    )
  const problems = diff(JSON.parse(readFileSync(file, 'utf8')), actual)
  if (problems.length === 0) {
    console.log(`ok        ${name}  (${Object.keys(actual).length} files)`)
    continue
  }
  failed = true
  console.error(`DRIFT     ${name}`)
  for (const p of problems) console.error(p)
}
if (failed) {
  console.error(
    '\nScaffold output changed. If the change is intended, re-record and review the diff.',
  )
  process.exit(1)
}
