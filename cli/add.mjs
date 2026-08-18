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

function assertName(name, what) {
  if (!NAME_RULE.test(name)) {
    throw new Error(
      `'${name}' is not a valid ${what} name — use lowercase letters and digits, starting with a ` +
        `letter (e.g. 'testimonials', 'pricing', 'faq2'). No dashes: the name is also a TypeScript ` +
        `identifier here.`,
    )
  }
}

const pascal = (s) => s[0].toUpperCase() + s.slice(1)

/**
 * The project root the command is being run from, proved by the files it is about to edit.
 *
 * The kit is refused explicitly, and that check is not decoration: the kit has
 * `src/blocks/registry.ts` too, so a `src/blocks/` test alone happily adds a block to the
 * generator itself. Measured, by doing it — the block landed in the kit's own registry, from
 * where every future scaffold would have shipped it. `cli/kit-manifest.mjs` exists only in the
 * kit; it is not in the list of things a scaffold receives.
 */
function projectRoot() {
  const cwd = process.cwd()
  if (existsSync(join(cwd, 'cli/kit-manifest.mjs'))) {
    throw new Error(
      `this is the landing-kit repository itself, not a generated project — adding a block here ` +
        `would ship it to every future scaffold. Run this from the project you scaffolded. ` +
        `(Current directory: ${cwd})`,
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

function blockFiles(id, variants) {
  const Copy = `${pascal(id)}Copy`
  const Variant = `${pascal(id)}Variant`
  const compName = (v) => `${pascal(id)}${pascal(v)}`

  const files = {
    'copy.mn.ts': `export type ${Copy} = {
  heading: string
  lead: string
}

export const mn: ${Copy} = {
  heading: '${pascal(id)} гарчиг',
  lead: 'Энд тайлбар бичнэ үү.',
}
`,
    'copy.en.ts': `import type { ${Copy} } from './copy.mn'

export const en: ${Copy} = {
  heading: '${pascal(id)} heading',
  lead: 'Write the description here.',
}
`,
    // Named imports are sorted too, and `mn` vs the copy type falls either side depending on the
    // block's name: `{ type CtaCopy, mn }` but `{ mn, type TestimonialsCopy }`. Hardcoding one
    // order fails `pnpm lint` for half of all block names.
    'manifest.ts': `import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { ${
      'mn'.localeCompare(Copy) < 0 ? `mn, type ${Copy}` : `type ${Copy}, mn`
    } } from './copy.mn'

// No component import here: this manifest is imported eagerly by registry.ts, so anything
// reachable from it lands in the main chunk. Components are reached through ./variants.ts only.
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
    'variants.ts': `import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { ${Copy} } from './copy.mn'
import type { ${Variant} } from './manifest'
${[...variants]
  .sort()
  .map((v) => `import { ${compName(v)} } from './${id}-${v}'`)
  .join('\n')}

// The only static import of these components anywhere — that is what gives Vite its split point.
// \`satisfies\` makes a variant named in manifest.ts but missing here a compile error.
export const variants = {
${variants.map((v) => `  ${v}: ${compName(v)},`).join('\n')}
} satisfies Record<${Variant}, ComponentType<BlockProps<${Copy}>>>
`,
  }

  for (const v of variants) {
    files[`${id}-${v}.tsx`] = `import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import type { BlockProps } from '@/lib/types'
import { Reveal } from '@/motion'
import type { ${Copy} } from './copy.mn'

export function ${compName(v)}({
  copy,
  surface,
  anchorId,
  headingLevel,
}: BlockProps<${Copy}>) {
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
  assertName(id, 'block')
  for (const v of variants) assertName(v, 'variant')
  if (new Set(variants).size !== variants.length) {
    throw new Error(`--variants has a duplicate: ${variants.join(', ')}`)
  }

  const root = projectRoot()
  const dir = join(root, 'src/blocks', id)
  if (existsSync(dir)) {
    throw new Error(`src/blocks/${id}/ already exists — pick another name, or delete it first.`)
  }
  if (read(root, 'src/blocks/registry.ts').includes(`from './${id}/manifest'`)) {
    throw new Error(`'${id}' is already registered in src/blocks/registry.ts.`)
  }

  // Every edit computed before the first write: a folder created next to an unregistered
  // registry is the half-finished state this command exists to prevent.
  const edits = []

  {
    const rel = 'src/blocks/registry.ts'
    const lines = read(root, rel).split('\n')
    insertSortedImport(
      lines,
      /^import \{ \w+ \} from '\.\/[\w-]+\/manifest'$/,
      `import { ${id} } from './${id}/manifest'`,
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
  const blocks = opts.blocks ?? []
  if (blocks.length === 0) {
    throw new Error(
      `--blocks is required: a page with no blocks renders an empty document, and ` +
        `\`pnpm verify\` fails it for having no <h1>. Available: ${available.join(', ')}`,
    )
  }
  for (const b of blocks) {
    if (!available.includes(b)) {
      throw new Error(`'${b}' is not a block in this project. Available: ${available.join(', ')}`)
    }
  }

  // Required, and required to DIFFER. Defaulting both to the page id was measured writing a page
  // whose two locales shared a <title>, which `verify-build.mjs` fails by design — duplicate
  // titles across locales are the SEO defect it exists to catch. A convenience default that
  // hands back a project failing its own gate is not a convenience.
  const { titleMn, titleEn } = opts
  if (!titleMn || !titleEn) {
    throw new Error(
      `--title-mn and --title-en are both required. Example:\n` +
        `  landing-kit add-page ${id} --blocks=${blocks.join(',')} ` +
        `--title-mn="Бидний тухай" --title-en="About us"`,
    )
  }
  if (titleMn === titleEn) {
    throw new Error(
      `--title-mn and --title-en are identical ('${titleMn}') — \`pnpm verify\` rejects two ` +
        `locales sharing a <title> as duplicate content. Give each language its own wording.`,
    )
  }
  const entry = `  {
    id: '${id}',
    path: '${path}',
    blocks: [${blocks.map((b) => `'${b}'`).join(', ')}],
    seo: {
      mn: { title: '${titleMn}', description: '${opts.descMn ?? titleMn}' },
      en: { title: '${titleEn}', description: '${opts.descEn ?? titleEn}' },
    },
  },
`

  const close = text.lastIndexOf(']')
  if (close === -1) throw new Error(`${rel}: cannot find the end of the \`pages\` array.`)
  writeFileSync(join(root, rel), text.slice(0, close) + entry + text.slice(close))

  return { rel, path, blocks, formatted: formatFiles(root, [rel]) }
}
