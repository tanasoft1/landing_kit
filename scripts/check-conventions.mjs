import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RULES = [
  { re: /\bpy-section\b/, msg: 'py-section belongs to <Section>, not to a block' },
  { re: /\bpx-gutter\b/, msg: 'px-gutter belongs to <Container>, not to a block' },
  { re: /className="[^"]*\bmax-w-/, msg: 'max-width utility — use <Container width="narrow">' },
  { re: /className="[^"]*\bcontainer\b/, msg: 'container utility — use <Container>' },
  { re: /<section[\s>]/, msg: 'raw <section> element — use <Section>' },
  { re: /\bmin-h-screen\b/, msg: 'min-h-screen — blocks must not assume viewport height' },
  // Catches ANY Tailwind arbitrary-value bracket escape (`text-[length:...]`, `rounded-[...]`,
  // `-left-[9999px]`, etc.), not just the two specific utilities named below — a previous
  // version of this rule only matched `text-[length:` and `rounded-[`, so `-left-[9999px]`
  // (an arbitrary-value escape used to hide the contact form's honeypot) sailed straight
  // through review. Use a scale/preset value (e.g. `-left-96`) instead.
  {
    re: /className="[^"]*-\[/,
    msg: 'arbitrary Tailwind value (bracket syntax) — use a scale/preset utility',
  },
  { re: /style=\{\{/, msg: 'inline style — use a Tailwind utility from the token layer' },
  {
    re: /<h1[\s>]/,
    msg: "<h1> outside the hero block — the hero owns the page's single <h1>; use <h2> here",
    exceptPath: (file) => file.startsWith(`${join('src', 'blocks', 'hero')}/`),
  },
]

const failures = []

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p)
    else if (p.endsWith('.tsx')) check(p)
  }
}

function check(file) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.exceptPath?.(file)) continue
      if (rule.re.test(line)) failures.push(`${file}:${i + 1}  ${rule.msg}`)
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
