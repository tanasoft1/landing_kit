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
 * Usage:  node tools/scaffold-snapshot.mjs record <variant>|--all-profiles
 *         node tools/scaffold-snapshot.mjs check  [variant]
 *
 * `record` takes a profile name, and a bare `record` is refused rather than merely discouraged —
 * see the ALL constant at the bottom of this file. Every `record` prints what it just blessed.
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
 * Six answer sets, covering the theme, preset, block, backend and panel axes:
 * `theme` pinned dark and pinned light as well as `both` (the answer picks a boundary file AND
 * edits biome.json and token-gallery, and only `dark` puts a class on <html>),
 * both presets (which filters `src/styles/presets`), a block subset, custom blocks
 * (which runs the add-block templates at scaffold time), a backend, and the admin panel.
 *
 * `admin` is the only variant that passes `--backend=admin`, so it is the one hashing output a
 * project WITH the panel receives: the `src/admin` tree (`ADMIN_COPY_DIRS`), the fourteen
 * packages in `ADMIN_RUNTIME_DEPS`, the admin branch of `routeTree.gen.ts`, the dev proxy and the
 * `/admin` prerender entry in `vite.config.ts`, and the admin branches of `transformThemeCss`
 * and `transformComponentsJson`.
 *
 * The other five prove the negative, and `default` and `backend` are the clearest of them: a
 * project that declined the panel receives no trace of it. So a change in those five after an
 * admin-side edit is not a snapshot needing a refresh, it is the regression this whole
 * arrangement exists to catch — panel content reaching a project that said no. Re-record the
 * `admin` profile by name (`record admin`). A bare `record` would re-record all six and bless
 * exactly that leak, which is why it is now refused.
 *
 * `isAdminPath` runs on every file of every one of these scaffolds — it is the filter in `keep()`
 * that produces the "no trace of the panel" result the five non-admin profiles hash.
 * `routeTreeGen`'s admin half runs on all six: `generateFiles` calls `assertRouteTreeMatchesKit`
 * on every scaffold, which builds the admin tree and compares it against the kit's own file, so
 * drift there fails every profile.
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
 *
 * `backend` is the one variant taking `--backend=api`: `default`, `onepage`, `custom` and
 * `subset` all take the default `--backend=none`, and `admin` takes the third branch. The API
 * tree, `docker-compose.yml` and the Go scripts in `package.json` reach `admin` too, so what
 * `backend` alone covers is the `api` answer's own shape — no dev proxy, no panel, an absolute
 * `VITE_CONTACT_ENDPOINT` reaching Fiber through CORS.
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
 * The one file whose bytes cannot be stable here, and the three fields that make it so:
 * `generatedAt` is the wall clock, `answers.dir` is the scaffold target, which is a fresh
 * `mkdtemp` path on every call, and `kitVersion` is whatever `package.json` says today. Hashed
 * raw, every variant reports drift on every run, and on every release, for reasons that have
 * nothing to do with drift.
 *
 * `kitVersion` is the least obvious of the three. It moves on a release schedule that has
 * nothing to do with the copy layer this tool guards, so hashing it makes `npm version` look
 * identical to a real regression. That is not merely untidy: `.github/workflows/release.yml`
 * gates its publish job on `verify`, so a bump without a re-record blocks the release it was
 * meant to cut.
 *
 * Normalised rather than skipped, because blanking a field is not the same as ignoring it. A
 * scaffold that stopped writing any of the three would leave the pattern unmatched and the
 * placeholder missing, so the hash still moves and the check still fails. That regression is
 * the reason this file is read at all, and it stays caught.
 */
const SCAFFOLD_RECORD = '.kit/scaffold.json'

function normalise(rel, buf) {
  if (rel !== SCAFFOLD_RECORD) return buf
  // String substitution, not `JSON.parse` plus re-stringify. `generate.mjs` writes this file
  // with its own fits-or-expands formatter, and a round trip through `JSON.stringify` rewrites
  // every line of it. That would hide a change to that formatter behind a normalisation meant
  // only to hide a clock, a temp path, and a version number. A pattern that stops matching leaves the raw value in
  // place, so this fails loudly rather than passing quietly.
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

/**
 * Every path in a diff, one per line, labelled.
 *
 * Capped, because the cap is the point: a re-record must be READ, and a thousand-line wall is not
 * read. Past the cap the counts still say what moved, and a caller who wants the rest has `check`.
 */
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

// `--all-profiles`, spelled out and hyphenated, rather than `--all` or a bare `record`. This is
// the one command that can bless a leak: re-recording the five non-admin profiles is how panel
// content reaching a project that declined the panel stops being a failure and becomes the
// baseline. It has to be harder to type than the thing it overwrites.
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

// A bare `record` used to re-record all six profiles. The rule "never a bare record, always by
// name" lived in the controller's head and in the docstring above; a rule nobody enforces is not a
// gate, and the shortest command was the one that ratifies a regression. Now it refuses.
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
    // The diff is computed BEFORE the write and printed after it, so a re-record says what it
    // just blessed. Without this, `record` printed only a file count — a non-admin profile
    // gaining two panel files looked exactly like a profile that had not moved at all.
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
