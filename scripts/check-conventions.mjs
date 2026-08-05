import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RULES = [
  { re: /\bpy-section\b/, msg: 'py-section belongs to <Section>, not to a block' },
  { re: /\bpx-gutter\b/, msg: 'px-gutter belongs to <Container>, not to a block' },
  {
    re: /className="[^"]*\bmax-w-/,
    contentRe: /\bmax-w-/,
    msg: 'max-width utility — use <Container width="narrow">',
  },
  {
    re: /className="[^"]*\bcontainer\b/,
    contentRe: /\bcontainer\b/,
    msg: 'container utility — use <Container>',
  },
  { re: /<section[\s>]/, msg: 'raw <section> element — use <Section>' },
  { re: /\bmin-h-screen\b/, msg: 'min-h-screen — blocks must not assume viewport height' },
  // Catches ANY Tailwind arbitrary-value bracket escape (`text-[length:...]`, `rounded-[...]`,
  // `-left-[9999px]`, etc.), not just the two specific utilities named below — a previous
  // version of this rule only matched `text-[length:` and `rounded-[`, so `-left-[9999px]`
  // (an arbitrary-value escape used to hide the contact form's honeypot) sailed straight
  // through review. Use a scale/preset value (e.g. `-left-96`) instead.
  {
    re: /className="[^"]*-\[/,
    contentRe: /-\[/,
    msg: 'arbitrary Tailwind value (bracket syntax) — use a scale/preset utility',
  },
  { re: /style=\{\{/, msg: 'inline style — use a Tailwind utility from the token layer' },
  // No exception list, unlike the rule this replaced. Heading level is never a block's own
  // decision — it depends on whether the block happens to be first on the page, which only the
  // renderer knows (`headingLevel` on `BlockProps`, assigned by `RenderBlocks`). A block with a
  // heading must do `const H = headingLevel === 1 ? 'h1' : 'h2'` and render `<H>`; a literal
  // `<h1>` or `<h2>` anywhere in `src/blocks` — hero included — is always wrong.
  {
    re: /<h[12][\s>]/,
    msg: "literal <h1>/<h2> — use `const H = headingLevel === 1 ? 'h1' : 'h2'` and render <H>",
  },
]

// Rules whose literal-match pattern (`re`) requires the text to appear inside a
// `className="…"` attribute are the ones with a `contentRe` — the same pattern with that
// requirement stripped, so it can be run against a class string resolved from a local
// constant instead of read directly off the line. Rules without `contentRe` (py-section,
// px-gutter, min-h-screen, raw <section>, inline style, literal <h1>/<h2>) are not scoped to
// `className="…"` in the first place, so they already see a class string wherever it appears
// literally in the file — including on the `const IDENT = '…'` declaration line itself — and
// need no extra handling here.
const CONTENT_RULES = RULES.filter((r) => r.contentRe)

const failures = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) check(p)
  }
}

// Resolves `const IDENT = '…'` / `"…"` string-literal declarations anywhere in `text`, so that
// `className={IDENT}` can be checked against the same content rules as a literal
// `className="…"`. Deliberately simple: only a plain single- or double-quoted string literal
// assigned directly to a bare identifier is resolved. Anything else — a template literal with
// interpolation, a function call, a prop, a destructured value — is left unresolved, and a
// `className={…}` that references an unresolved name is reported as a failure below rather
// than silently skipped. A convention checker that stays quiet about what it cannot verify is
// worse than one with a narrower reach: `className={field}` bypassed every content rule here
// until this was fixed, and nothing said so.
function resolveStringConsts(text) {
  const consts = new Map()
  const re = /^[^\n\S]*const\s+(\w+)\s*=\s*(['"])((?:(?!\2)[^\\]|\\.)*)\2/gm
  for (const m of text.matchAll(re)) consts.set(m[1], m[3])
  return consts
}

function check(file) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  const consts = resolveStringConsts(text)

  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.re.test(line)) failures.push(`${file}:${i + 1}  ${rule.msg}`)
    }

    // `className={identifier}` — a bare identifier only (no ternaries, template literals, or
    // calls; those aren't the "simple case" this resolves and are left to human review as
    // before).
    const identMatch = line.match(/className=\{(\w+)\}/)
    if (!identMatch) return
    const ident = identMatch[1]

    if (!consts.has(ident)) {
      failures.push(
        `${file}:${i + 1}  className={${ident}} cannot verify — inline the classes or use a literal`,
      )
      return
    }

    const value = consts.get(ident)
    for (const rule of CONTENT_RULES) {
      if (rule.contentRe.test(value)) {
        failures.push(`${file}:${i + 1}  ${rule.msg} (via const ${ident} = '${value}')`)
      }
    }
  })
}

walk('src/blocks')

if (failures.length) {
  console.error(`\n✗ check-conventions: ${failures.length} violation(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('✓ check-conventions: blocks follow layout primitives')
