import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `add-block` and `add-page`, run INSIDE a generated project rather than against the kit.
 *
 * Everything here edits files the developer owns and may already have changed, so every edit is
 * anchored to structure that must exist for the project to compile at all (an object literal's
 * opening line, an import group), never to exact prose. Each anchor throws by name when it is
 * missing, because the alternative — writing five new files and silently failing to register
 * them — is the exact failure this command exists to remove.
 *
 * No write happens until every edit has been computed. A half-added block (folder on disk,
 * registry untouched) fails `pnpm verify` in a way that reads like the developer's mistake.
 */

// Object keys and the manifest's exported const share this name, so it has to be a valid
// identifier AND a valid folder name with no quoting anywhere. Dashes would need quoting in four
// object literals and a different casing for the export; refusing them is cheaper than that.
const NAME_RULE = /^[a-z][a-z0-9]*$/

/** The reason `name` is unusable, or null. Shared with the scaffolding prompt, which shows it. */
export function nameProblem(name, what) {
  if (NAME_RULE.test(name)) return null
  return (
    `'${name}' is not a valid ${what} name — use lowercase letters and digits, starting with a ` +
    `letter (e.g. 'testimonials', 'pricing', 'faq2'). No dashes: the name is also a TypeScript ` +
    `identifier here.`
  )
}

function assertName(name, what) {
  const problem = nameProblem(name, what)
  if (problem !== null) throw new Error(problem)
}

/**
 * Names a BLOCK cannot have, on top of the character rule.
 *
 * A block id is written into generated code as a binding: `import { faq } from './faq/block'`.
 * Two groups of words break that, and both produce a project that will not compile, from a name
 * the CLI accepted:
 *
 *   - reserved words. `import { default } from './default/block'` is a syntax error.
 *   - the identifiers `registry.ts`, `block-modules.ts` and `variants.all.ts` already declare.
 *     A block named `registry` collides with the exported `registry` const in the same file.
 *
 * Both were reproduced before this list existed. It applies to block names only — variant names
 * become object keys and component-name fragments, where `default` is fine, and the kit's own
 * contact block has a variant called exactly that.
 */
const RESERVED_BLOCK_NAMES = new Set([
  // Reserved words, plus the strict-mode and module-scope ones. Only lowercase spellings can
  // reach here: the character rule already refuses a leading capital.
  ...`await break case catch class const continue debugger default delete do else enum export
      extends false finally for function if implements import in instanceof interface let new null
      package private protected public return static super switch this throw true try typeof var
      void while with yield`.split(/\s+/),
  // Declared by the files that would import the block. `blockModules` and `registerVariants` are
  // declared there too and are deliberately NOT listed: the character rule refuses a capital
  // letter, so no name that reaches here can collide with them, and an entry that can never fire
  // is an entry nobody can trust.
  'all',
  'manifests',
  'registry',
  'variants',
])

/** The reason `name` cannot be a block, or null. Used by `add-block` and by the scaffolder. */
export function blockNameProblem(name) {
  const problem = nameProblem(name, 'block')
  if (problem !== null) return problem
  if (RESERVED_BLOCK_NAMES.has(name)) {
    return (
      `'${name}' cannot be a block name — it is a reserved word or a name the generated files ` +
      `already use, and \`import { ${name} } from './${name}/block'\` would not compile. ` +
      `Try '${name}s' or something more specific.`
    )
  }
  return null
}

const pascal = (s) => s[0].toUpperCase() + s.slice(1)

/**
 * The project root the command is being run from, proved by the files it is about to edit.
 *
 * This test is positive (proving a generated project) rather than negative (refusing the kit),
 * and that is not a style choice: a negative test here already failed silently once. It used to
 * check for `cli/kit-manifest.mjs` next to the cwd, which held only while the kit's own template
 * was the repo root, so `cli/` sat beside `src/blocks/`. Once the template moved to `apps/web/`,
 * that file was never in a generated project's ancestry to begin with, and the check kept
 * "passing" (silently stopped guarding) while looking exactly as it did when it worked. Measured,
 * by doing it: the block landed in the kit's own registry, from where every future scaffold would
 * have shipped it. A guard that can go quiet like that is worse than no guard, because it looks
 * present on every future read of this file.
 *
 * `.kit/scaffold.json` is written by `generateFiles` into every generated project unconditionally,
 * and survives `git init` because the generated `.gitignore` un-ignores it specifically
 * (`.kit/*` then `!.kit/scaffold.json`), so its absence proves "not a generated project" however
 * the repo that holds the template is laid out today or gets laid out next. The kit's own
 * `apps/web/.kit/` exists but holds only build artifacts (`build-stamp.json`, `urls.json`), never
 * `scaffold.json`, so standing in the kit's template still refuses here.
 */
function projectRoot() {
  const cwd = process.cwd()
  if (!existsSync(join(cwd, '.kit/scaffold.json'))) {
    throw new Error(
      `not a generated project: no .kit/scaffold.json here. If this is the landing-kit ` +
        `repository, adding a block would ship it to every future scaffold; run this from a ` +
        `project you scaffolded. (Current directory: ${cwd})`,
    )
  }
  if (!existsSync(join(cwd, 'src/blocks/registry.ts'))) {
    throw new Error(
      `src/blocks/registry.ts not found — run this from the root of a generated project, not ` +
        `from a parent directory. (Current directory: ${cwd})`,
    )
  }
  return cwd
}

function read(root, rel) {
  return readFileSync(join(root, rel), 'utf8')
}

/** Existing block ids, from the folders themselves rather than a list that could be stale. */
function existingBlocks(root) {
  return readdirSync(join(root, 'src/blocks'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}

// --- line surgery -------------------------------------------------------------------------------

const SINGLE_LINE_IMPORT = /^import\s.*\sfrom\s'([^']+)'$/
const specifier = (l) => SINGLE_LINE_IMPORT.exec(l)?.[1] ?? ''

// Bare packages, then `@/` aliases, then relatives — the grouping Biome's `organizeImports`
// applies before sorting by specifier within each group.
const importRank = (s) => (s.startsWith('.') ? 2 : s.startsWith('@/') ? 1 : 0)

/**
 * Re-sort the file's leading run of imports the way `organizeImports` would.
 *
 * Sorting the WHOLE run, not just the sibling group being extended: `./testimonials/variants`
 * sorts after `./registry`, so a group-local sort placed it correctly relative to its siblings
 * and wrongly relative to everything else. Measured — `pnpm verify` failed on exactly that line
 * while the new block itself was fine.
 *
 * Skipped entirely if the run holds anything but single-line imports. A multi-line import would
 * be shredded by line-based sorting, and a command that corrupts a file the developer wrote is
 * far worse than one that leaves a lint error `pnpm fix` clears.
 */
function sortImportBlock(lines) {
  let end = 0
  while (end < lines.length && lines[end].startsWith('import ')) end++
  if (end === 0) return
  const run = lines.slice(0, end)
  if (!run.every((l) => SINGLE_LINE_IMPORT.test(l))) return
  run.sort((a, b) => {
    const [x, y] = [specifier(a), specifier(b)]
    return importRank(x) - importRank(y) || x.localeCompare(y)
  })
  lines.splice(0, end, ...run)
}

/**
 * Add `line` to the import group whose lines match `pattern`, then re-sort the whole run.
 *
 * `pattern` is not just a place to insert — it is the assertion that this file still has the
 * import group the command knows how to extend. A file restructured past recognition should
 * throw here rather than get an import appended somewhere arbitrary.
 */
function insertSortedImport(lines, pattern, line, rel) {
  const last = lines.reduce((acc, l, i) => (pattern.test(l) ? i : acc), -1)
  if (last === -1) {
    throw new Error(
      `${rel}: no import matching ${pattern} — this file no longer has the import group this ` +
        `command extends, so the new block cannot be registered by editing it.`,
    )
  }
  lines.splice(last + 1, 0, line)
  sortImportBlock(lines)
}

/**
 * Append `entry` as the last `  name,` line of the object literal opened by `openPattern`.
 *
 * Anchored to the last existing entry rather than to the closing brace: both objects in
 * `registry.ts` carry trailing comments before their `}`, and inserting after those would put the
 * new key below a comment that explains the line above it.
 */
function appendObjectEntry(lines, openPattern, entry, rel, label) {
  const open = lines.findIndex((l) => openPattern.test(l))
  if (open === -1) {
    throw new Error(
      `${rel}: cannot find ${label} (looking for ${openPattern}) — the file has been restructured, ` +
        `so this command cannot register the block. Add \`${entry.trim()}\` to it by hand.`,
    )
  }
  let last = -1
  for (let i = open + 1; i < lines.length; i++) {
    if (/^\s*\}/.test(lines[i])) break
    if (/^\s+[A-Za-z_$][\w$]*,\s*$/.test(lines[i])) last = i
  }
  if (last === -1) {
    throw new Error(
      `${rel}: ${label} has no entries to append after — add \`${entry.trim()}\` by hand.`,
    )
  }
  lines.splice(last + 1, 0, entry)
}

/**
 * Format the touched files with the PROJECT's own Biome, not with rules restated here.
 *
 * Templates cannot predict the formatter: whether `pricing: () => import(…)` fits on one line
 * depends on the block's name length against `lineWidth`, so the same template is correctly
 * formatted for one name and wrong for another. Both were measured — `testimonials` wraps,
 * `pricing` does not, and hand-emulating that in a string template is a second copy of Biome's
 * line-breaking rules that will drift from the real one.
 *
 * Best-effort by design. Before `pnpm install` there is no Biome to run, which is a normal state
 * for a project someone just scaffolded — the caller reports that and points at `pnpm fix`
 * instead of failing work that is already correctly written.
 */
function formatFiles(root, files) {
  const bin = join(root, 'node_modules/.bin/biome')
  if (!existsSync(bin)) return { ran: false, why: 'Biome is not installed yet' }
  const r = spawnSync(bin, ['check', '--write', ...files], { cwd: root, encoding: 'utf8' })
  if (r.error) return { ran: false, why: r.error.message }
  if (r.status !== 0) return { ran: false, why: `biome exited ${r.status}` }
  return { ran: true }
}

// --- templates ----------------------------------------------------------------------------------

/**
 * The files a new block folder is made of. Exported because the scaffolder writes these too: a
 * block typed into the "add your own" row at scaffold time and one added later with `add-block`
 * must be the same thing, and two copies of these templates would drift.
 */
export function blockFiles(id, variants) {
  const Copy = `${pascal(id)}Copy`
  const Variant = `${pascal(id)}Variant`
  const compName = (v) => `${pascal(id)}${pascal(v)}`

  const files = {
    // Both languages in one file, with the type they share. Declaring the type once and typing
    // both exports against it is what makes a missing translation a compile error.
    'copy.ts': `export type ${Copy} = {
  heading: string
  lead: string
}

export const mn: ${Copy} = {
  heading: '${pascal(id)} гарчиг',
  lead: 'Энд тайлбар бичнэ үү.',
}

export const en: ${Copy} = {
  heading: '${pascal(id)} heading',
  lead: 'Write the description here.',
}
`,
    // Named imports are sorted too, ignoring the `type` keyword and the case, so where the copy
    // type falls depends on the block's name: `{ type CtaCopy, en, mn }` but
    // `{ en, type FaqCopy, mn }`. Hardcoding one order fails `pnpm lint` for a third of all names.
    'block.ts': `import type { BlockManifest } from '@/lib/types'
import { ${['en', 'mn', Copy]
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .map((name) => (name === Copy ? `type ${name}` : name))
      .join(', ')} } from './copy'

// No component import here: this file is imported eagerly by registry.ts, so anything reachable
// from it lands in the main chunk. Components are reached through ./variants.ts only.
const variantNames = [${variants.map((v) => `'${v}'`).join(', ')}] as const

export type ${Variant} = (typeof variantNames)[number]

export const ${id} = {
  id: '${id}',
  variantNames,
  defaultVariant: '${variants[0]}',
  copy: { mn, en },
  // Add \`nav: { labelKey: 'heading' }\` to put this block in the header menu.
  // Add \`requires: { blocks: ['contact'] }\` if this block's copy links to another block.
} satisfies BlockManifest<${Copy}, ${Variant}>
`,
    // The relative imports are sorted by specifier, the way `organizeImports` wants them, rather
    // than written in a fixed order. Hardcoding one order was wrong for every block — `./block`
    // sorts before `./copy` — and it went unnoticed because `add-block` runs Biome over its own
    // output straight afterwards. The scaffolder cannot: a project one second old has no Biome
    // installed yet, so `pnpm verify` was the thing that reported it.
    'variants.ts': `import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
${[
  ['./block', `import type { ${Variant} } from './block'`],
  ['./copy', `import type { ${Copy} } from './copy'`],
  ...variants.map((v) => [`./${id}-${v}`, `import { ${compName(v)} } from './${id}-${v}'`]),
]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, line]) => line)
  .join('\n')}

// The only static import of these components anywhere — that is what gives Vite its split point.
// \`satisfies\` makes a variant named in block.ts but missing here a compile error.
export const variants = {
${variants.map((v) => `  ${v}: ${compName(v)},`).join('\n')}
} satisfies Record<${Variant}, ComponentType<BlockProps<${Copy}>>>
`,
  }

  for (const v of variants) {
    // Biome keeps the destructured props on one line while they fit in 100 columns and breaks them
    // one-per-line when they do not, and which side a block lands on depends only on the length of
    // its name — `PricingSimple` fits, `TestimonialsSimple` does not. Same rule as
    // `blockModuleEntry` in generate.mjs, and the same reason: a scaffold has no Biome yet.
    const signature = `export function ${compName(v)}({ copy, surface, anchorId, headingLevel }: BlockProps<${Copy}>) {`
    files[`${id}-${v}.tsx`] = `import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { ${Copy} } from './copy'

${
  signature.length <= 100
    ? signature
    : `export function ${compName(v)}({
  copy,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<${Copy}>) {`
}
  const H = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <Section id={anchorId} surface={surface}>
      <Container width="narrow" className="text-center">
        <Reveal>
          <H className="text-h2 font-semibold text-balance">{copy.heading}</H>
          <p className="text-muted-foreground text-lead mt-4 text-pretty">{copy.lead}</p>
        </Reveal>
      </Container>
    </Section>
  )
}
`
  }

  return files
}

// --- add-block ----------------------------------------------------------------------------------

export function addBlock(id, variants) {
  const nameIssue = blockNameProblem(id)
  if (nameIssue !== null) throw new Error(nameIssue)
  for (const v of variants) assertName(v, 'variant')
  if (new Set(variants).size !== variants.length) {
    throw new Error(`--variants has a duplicate: ${variants.join(', ')}`)
  }

  const root = projectRoot()
  const dir = join(root, 'src/blocks', id)
  if (existsSync(dir)) {
    throw new Error(`src/blocks/${id}/ already exists — pick another name, or delete it first.`)
  }
  const registrySrc = read(root, 'src/blocks/registry.ts')
  if (registrySrc.includes(`from './${id}/block'`)) {
    throw new Error(`'${id}' is already registered in src/blocks/registry.ts.`)
  }

  // Projects scaffolded before block folders were reshaped import `./<id>/manifest`, so every
  // anchor below misses. Named here rather than left to the generic "no import matching …" throw,
  // which reads as though the developer had broken their own file. Detected on the registry, not
  // on a version in `.kit/scaffold.json`: the file being edited is the thing that has to match.
  if (/from '\.\/[\w-]+\/manifest'/.test(registrySrc)) {
    throw new Error(
      `this project was created by an older version of the kit, where a block's metadata lived ` +
        `in \`manifest.ts\` rather than \`block.ts\`.\n` +
        `  Use the matching version, which knows that layout:\n` +
        `    pnpm dlx @dewsoft/landing-kit@0.2.0 add-block ${id}\n` +
        `  Newer scaffolds put both languages in one \`copy.ts\` and the metadata in \`block.ts\`; ` +
        `mixing the two shapes in one project is not worth the confusion.`,
    )
  }

  // Every edit computed before the first write: a folder created next to an unregistered
  // registry is the half-finished state this command exists to prevent.
  const edits = []

  {
    const rel = 'src/blocks/registry.ts'
    const lines = read(root, rel).split('\n')
    insertSortedImport(
      lines,
      /^import \{ \w+ \} from '\.\/[\w-]+\/block'$/,
      `import { ${id} } from './${id}/block'`,
      rel,
    )
    appendObjectEntry(lines, /^const manifests = \{$/, `  ${id},`, rel, 'the `manifests` object')
    appendObjectEntry(
      lines,
      /^export const registry: Record<BlockId, BlockManifest<any, any>> = \{$/,
      `  ${id},`,
      rel,
      'the `registry` object',
    )
    edits.push([rel, lines.join('\n')])
  }

  {
    const rel = 'src/blocks/block-modules.ts'
    const lines = read(root, rel).split('\n')
    const open = lines.findIndex((l) => /^export const blockModules/.test(l))
    if (open === -1) throw new Error(`${rel}: cannot find the \`blockModules\` object.`)
    let close = -1
    for (let i = open + 1; i < lines.length; i++) {
      if (/^\}/.test(lines[i])) {
        close = i
        break
      }
    }
    if (close === -1) throw new Error(`${rel}: \`blockModules\` has no closing brace.`)
    lines.splice(
      close,
      0,
      `  ${id}: () =>`,
      `    import('./${id}/variants').then((m) => registerVariants('${id}', m.variants)),`,
    )
    edits.push([rel, lines.join('\n')])
  }

  {
    const rel = 'src/blocks/variants.all.ts'
    const lines = read(root, rel).split('\n')
    insertSortedImport(
      lines,
      /^import \{ variants as \w+ \} from '\.\/[\w-]+\/variants'$/,
      `import { variants as ${id} } from './${id}/variants'`,
      rel,
    )
    appendObjectEntry(lines, /^const all: Record<BlockId/, `  ${id},`, rel, 'the `all` object')
    edits.push([rel, lines.join('\n')])
  }

  const files = blockFiles(id, variants)

  mkdirSync(dir, { recursive: true })
  const written = []
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(dir, name), body)
    written.push(`src/blocks/${id}/${name}`)
  }
  for (const [rel, body] of edits) writeFileSync(join(root, rel), body)

  const edited = edits.map(([rel]) => rel)
  const formatted = formatFiles(root, [...written, ...edited])

  return { written, edited, variants, formatted }
}

// --- add-page -----------------------------------------------------------------------------------

export function addPage(id, opts) {
  assertName(id, 'page')

  const root = projectRoot()
  const rel = 'src/config/pages.config.ts'
  const text = read(root, rel)

  if (new RegExp(`\\bid: '${id}'`).test(text)) {
    throw new Error(`A page with id '${id}' already exists in ${rel}.`)
  }

  const path = opts.path ?? `/${id}`
  if (!path.startsWith('/')) throw new Error(`--path must start with '/' (got '${path}')`)
  if (new RegExp(`\\bpath: '${path.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}'`).test(text)) {
    throw new Error(`A page already uses the path '${path}' in ${rel}.`)
  }

  const available = existingBlocks(root)
  // A page needs at least one block: with none it renders an empty document and `pnpm verify`
  // fails it for having no <h1>. Any block already in the project is a safe default — the
  // scaffold proved every block's copy links resolve somewhere in `pages.config.ts`, and a block
  // id resolves against the whole config, not just the page it sits on.
  const fallbackBlock = available.includes('features') ? 'features' : available[0]
  const blocks = opts.blocks?.length ? opts.blocks : [fallbackBlock]
  for (const b of blocks) {
    if (!available.includes(b)) {
      throw new Error(`'${b}' is not a block in this project. Available: ${available.join(', ')}`)
    }
  }

  // The two locales must DIFFER, for the title and the description alike: `verify-build.mjs`
  // fails a build where two locales share either, because that is the duplicate-content defect it
  // exists to catch. So the defaults are per-locale placeholders rather than one shared string —
  // defaulting both to the page id was measured handing back a project that failed its own gate.
  const titleMn = opts.titleMn ?? `${pascal(id)} (mn)`
  const titleEn = opts.titleEn ?? `${pascal(id)} (en)`
  if (titleMn === titleEn) {
    throw new Error(
      `--title-mn and --title-en are identical ('${titleMn}') — \`pnpm verify\` rejects two ` +
        `locales sharing a <title> as duplicate content. Give each language its own wording.`,
    )
  }
  const descMn = opts.descMn ?? `${pascal(id)} хуудасны тайлбар.`
  const descEn = opts.descEn ?? `Description of the ${pascal(id)} page.`
  if (descMn === descEn) {
    throw new Error(
      `--desc-mn and --desc-en are identical ('${descMn}') — \`pnpm verify\` rejects two locales ` +
        `sharing a meta description as duplicate content. Give each language its own wording.`,
    )
  }

  // Escaped, because these strings are being written INTO TypeScript source as single-quoted
  // literals. An apostrophe is ordinary in English copy ("Mongolia's story") and would otherwise
  // close the literal early and leave `pages.config.ts` unparseable.
  const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const entry = `  {
    id: '${id}',
    path: '${path}',
    blocks: [${blocks.map((b) => `'${b}'`).join(', ')}],
    seo: {
      mn: { title: '${q(titleMn)}', description: '${q(descMn)}' },
      en: { title: '${q(titleEn)}', description: '${q(descEn)}' },
    },
  },
`

  const close = text.lastIndexOf(']')
  if (close === -1) throw new Error(`${rel}: cannot find the end of the \`pages\` array.`)
  writeFileSync(join(root, rel), text.slice(0, close) + entry + text.slice(close))

  // `placeholders` drives the next-steps output: text nobody chose is text nobody should ship, so
  // the caller leads with "replace this" only when it actually wrote a placeholder.
  const placeholders = !opts.titleMn || !opts.titleEn || !opts.descMn || !opts.descEn
  return { rel, path, blocks, placeholders, formatted: formatFiles(root, [rel]) }
}
