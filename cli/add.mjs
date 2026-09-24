import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `add-block` and `add-page`, run inside a generated project. Every edit is anchored to code the
 * project needs to compile, and throws by name if the anchor is missing. Nothing is written until
 * every edit is computed, so a failure never leaves a half-added block.
 */

// Used as an object key, an export name and a folder name, so no dashes or quoting.
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
 * Names a block cannot have. A block id becomes an import binding, so reserved words and the names
 * `registry.ts`, `block-modules.ts` and `variants.all.ts` already declare would not compile.
 * Variant names don't have this limit.
 */
const RESERVED_BLOCK_NAMES = new Set([
  // Reserved words, plus the strict-mode and module-scope ones. Lowercase only: the character rule
  // refuses capitals.
  ...`await break case catch class const continue debugger default delete do else enum export
      extends false finally for function if implements import in instanceof interface let new null
      package private protected public return static super switch this throw true try typeof var
      void while with yield`.split(/\s+/),
  // Declared by the files that import the block. Names with capitals can't reach here.
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
 * The project root, proved by `.kit/scaffold.json`, which every generated project has and the
 * kit's own template never does. A positive test on purpose: an earlier "not the kit" test went
 * quiet after a move and let a block land in the kit's own registry.
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
 * Re-sort the file's leading imports the way `organizeImports` would: the whole run, not one group.
 * Skipped if any import spans lines, because line-based sorting would break it.
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
 * Add `line` to the import group matching `pattern`, then re-sort. Throws if the group is gone,
 * rather than appending somewhere arbitrary.
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
 * Append `entry` after the last `  name,` line of the object opened by `openPattern`. Not before the
 * closing brace, because comments sit there.
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
 * Format the touched files with the project's own Biome, since line breaks depend on name length.
 * Best-effort: before `pnpm install` there is no Biome, and the caller points at `pnpm fix`.
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

/** The files a new block folder is made of. Exported so the scaffolder writes the same files. */
export function blockFiles(id, variants) {
  const Copy = `${pascal(id)}Copy`
  const Variant = `${pascal(id)}Variant`
  const compName = (v) => `${pascal(id)}${pascal(v)}`

  const files = {
    // One shared type for both languages, so a missing translation is a compile error.
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
    // Named imports are sorted ignoring `type` and case, so the copy type's position depends on the
    // block's name.
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
    // Relative imports sorted by specifier, as `organizeImports` wants. A fresh scaffold has no
    // Biome yet to fix the order.
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
    // Biome puts the props one per line past 100 columns, which depends on the name length. A fresh
    // scaffold has no Biome yet, so this matches it by hand.
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

  // Projects from before the block folder reshape import `./<id>/manifest`. Say so plainly instead
  // of a generic anchor error.
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

  // Every edit computed before the first write.
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
  // A page needs at least one block, or it has no <h1>. Any existing block is a safe default.
  const fallbackBlock = available.includes('features') ? 'features' : available[0]
  const blocks = opts.blocks?.length ? opts.blocks : [fallbackBlock]
  for (const b of blocks) {
    if (!available.includes(b)) {
      throw new Error(`'${b}' is not a block in this project. Available: ${available.join(', ')}`)
    }
  }

  // The two languages must differ in title and description, or verify-build fails the page as
  // duplicate content. So the placeholders differ per language.
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

  // Escaped: these go into single-quoted TypeScript strings, and copy often has apostrophes.
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

  // `placeholders` tells the caller to say "replace this" in the next steps.
  const placeholders = !opts.titleMn || !opts.titleEn || !opts.descMn || !opts.descEn
  return { rel, path, blocks, placeholders, formatted: formatFiles(root, [rel]) }
}
