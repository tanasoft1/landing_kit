#!/usr/bin/env node
/**
 * Hashes every file of a real scaffold, per answer set, and compares with the recorded baseline.
 * It catches a copy transform that quietly stopped firing, which a hand-read diff misses.
 *
 * Usage:  node tools/scaffold-snapshot.mjs record <variant>|--all-profiles
 *         node tools/scaffold-snapshot.mjs check  [variant]
 *
 * A bare `record` is refused. Every `record` prints what it changed.
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
 * Six answer sets, covering theme, preset, block subsets, custom blocks, `--backend=api` and
 * `--backend=admin`. Only `admin` gets the panel. If an admin-side change moves any of the other
 * five, that is panel content leaking into projects that declined it, not a snapshot to refresh.
 *
 * `--yes` is on every set, so questions the flags don't answer take their defaults instead of
 * failing. Both subsets are legal: `hero` needs `contact`, and `cta` needs `contact` and `features`.
 */
const VARIANTS = {
  default: ['--yes'],
  onepage: ['--yes', '--pages=one', '--theme=dark', '--preset=warm', '--blocks=hero,contact'],
  custom: ['--yes', '--add-blocks=pricing,faq'],
  subset: ['--yes', '--blocks=features,contact', '--theme=light'],
  backend: ['--yes', '--backend=api'],
  admin: ['--yes', '--backend=admin'],
}

/**
 * `.kit/scaffold.json` holds three fields that change every run: `generatedAt` (the clock),
 * `answers.dir` (a temp path) and `kitVersion` (bumped per release). They are replaced with fixed
 * values, not skipped, so a scaffold that stops writing them still fails the check.
 */
const SCAFFOLD_RECORD = '.kit/scaffold.json'

function normalise(rel, buf) {
  if (rel !== SCAFFOLD_RECORD) return buf
  // String substitution, not a JSON round trip, which would reformat every line and hide a change
  // to generate.mjs's formatter. A pattern that stops matching leaves the raw value, so it fails.
  return Buffer.from(
    buf
      .toString('utf8')
      .replace(/"kitVersion": "[^"]*"/, '"kitVersion": "<normalised>"')
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
 * Scaffolds into a fresh temp directory and returns path -> sha256. The target's parent is the temp
 * dir, so `registerInWorkspace` never edits the kit's own workspace file.
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
  const missing = []
  const changed = []
  const added = []
  for (const [path, hash] of Object.entries(expected)) {
    if (!(path in actual)) missing.push(path)
    else if (actual[path] !== hash) changed.push(path)
  }
  for (const path of Object.keys(actual)) {
    if (!(path in expected)) added.push(path)
  }
  const total = missing.length + changed.length + added.length
  return { missing: missing.sort(), changed: changed.sort(), added: added.sort(), total }
}

/** Every path in a diff, one per line, labelled. Capped so a re-record is short enough to read. */
const SHOWN = 25

function formatDiff(d, indent) {
  const lines = []
  for (const [label, paths] of [
    ['new    ', d.added],
    ['missing', d.missing],
    ['changed', d.changed],
  ]) {
    for (const p of paths.slice(0, SHOWN)) lines.push(`${indent}${label}  ${p}`)
  }
  if (d.total > lines.length) lines.push(`${indent}… and ${d.total - lines.length} more`)
  return lines
}

const counts = (d) => `+${d.added.length} -${d.missing.length} ~${d.changed.length}`

// `--all-profiles` is hard to type on purpose: re-recording the non-admin profiles is how a panel
// leak would become the baseline.
const ALL = '--all-profiles'

const [, , mode, ...rest] = process.argv
const USAGE =
  'Usage: node tools/scaffold-snapshot.mjs record <variant>|--all-profiles\n' +
  '       node tools/scaffold-snapshot.mjs check  [variant]'
if (mode !== 'record' && mode !== 'check') {
  console.error(USAGE)
  process.exit(2)
}

const only = rest.find((a) => a !== ALL)
const all = rest.includes(ALL)

// A bare `record` would re-record all six profiles, so it refuses.
if (mode === 'record' && !only && !all) {
  console.error(
    `Refusing a bare 'record'. It would rewrite all ${Object.keys(VARIANTS).length} profiles:\n` +
      Object.keys(VARIANTS)
        .map((n) => `  ${n}`)
        .join('\n') +
      '\n\nFive of those prove the NEGATIVE — that a project which declined the admin panel ' +
      'receives\nno trace of it. Re-recording them turns panel content leaking into every ' +
      'scaffold from a\nfailure into the baseline, and prints nothing that says so.\n\n' +
      `Name the one profile you meant:   node tools/scaffold-snapshot.mjs record ${Object.keys(VARIANTS)[0]}\n` +
      `Or, if you really mean all of them:   node tools/scaffold-snapshot.mjs record ${ALL}`,
  )
  process.exit(2)
}
if (mode === 'check' && all) {
  console.error(`${ALL} is a 'record' option; 'check' already checks every profile by default.`)
  process.exit(2)
}

const names = only ? [only] : Object.keys(VARIANTS)
for (const name of names) {
  if (!VARIANTS[name])
    throw new Error(`No such variant '${name}'. Have: ${Object.keys(VARIANTS).join(', ')}`)
}

mkdirSync(SNAP_DIR, { recursive: true })
let failed = false
let recordedAnyChange = false
for (const name of names) {
  const file = join(SNAP_DIR, `${name}.json`)
  const actual = scaffold(VARIANTS[name])
  if (mode === 'record') {
    // The diff is computed before the write and printed after, so a re-record says what it blessed.
    const previous = existsSync(file) ? diff(JSON.parse(readFileSync(file, 'utf8')), actual) : null
    writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`)
    const shape = previous === null ? 'new snapshot' : counts(previous)
    console.log(`recorded  ${name}  (${Object.keys(actual).length} files, ${shape})`)
    if (previous && previous.total > 0) {
      recordedAnyChange = true
      for (const line of formatDiff(previous, '  ')) console.log(line)
    }
    continue
  }
  if (!existsSync(file))
    throw new Error(
      `No snapshot for '${name}'. Run: node tools/scaffold-snapshot.mjs record ${name}`,
    )
  const d = diff(JSON.parse(readFileSync(file, 'utf8')), actual)
  if (d.total === 0) {
    console.log(`ok        ${name}  (${Object.keys(actual).length} files)`)
    continue
  }
  failed = true
  console.error(`DRIFT     ${name}  (${counts(d)})`)
  for (const line of formatDiff(d, '  ')) console.error(line)
}
if (recordedAnyChange) {
  console.log(
    '\nRead the lines above before committing them. A path under src/admin, src/routes/admin,\n' +
      'or any file appearing in a profile other than `admin`, is panel content reaching a ' +
      'project\nthat declined the panel — the regression these snapshots exist to catch.',
  )
}
if (failed) {
  console.error(
    '\nScaffold output changed. If the change is intended, re-record BY NAME and review the diff.',
  )
  process.exit(1)
}
