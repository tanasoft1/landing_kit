import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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

// --- no client-side <Link> outside src/routes -----------------------------------------------
// Block modules are resolved ONCE, off the initial URL, before hydration — see the comment at
// `src/client.tsx`'s `hydrate()` await. A `<Link>` from `@tanstack/react-router` performs a
// client-side transition, which can land on a page whose blocks were never fetched: the block
// renders with a module that was never registered, and `getVariants` throws — with no build-time
// signal. Every navigation on this stack is deliberately a plain `<a href>` (a full page load,
// cheap because every page is prerendered static HTML). That's a recorded design property, not a
// gap, so it's enforced here rather than left to be rediscovered by whoever adds the next nav
// link. Scoped to `src/blocks` and `src/shell`, not `src/routes` — route-level `<Link>` usage
// would legitimately belong there if this kit ever grew one.
const LINK_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*(['"])@tanstack\/react-router\2/g

function walkFiles(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkFiles(p, visit)
    else if (p.endsWith('.tsx')) visit(p)
  }
}

function checkNoRouterLink(file) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(LINK_IMPORT_RE)) {
    if (!/\bLink\b/.test(match[1])) continue
    const line = text.slice(0, match.index).split('\n').length
    failures.push(
      `${file}:${line}  imports Link from '@tanstack/react-router' — block modules are ` +
        `resolved once, pre-hydration, off the initial URL only (src/client.tsx); a client-side ` +
        `route transition via <Link> would render a page whose blocks were never registered. ` +
        `Use a plain <a href> instead.`,
    )
  }
}

walkFiles('src/blocks', checkNoRouterLink)
walkFiles('src/shell', checkNoRouterLink)

// --- /docs must keep its `noindex` ------------------------------------------------------------
// Asserted here, at the source level, because it CANNOT be asserted from `dist/`: `/docs` is
// deliberately never prerendered, so there is no artifact for `scripts/verify-build.mjs` to read.
//
// This meta tag is now the ONLY mechanism keeping `/docs` out of the search index on an SSR
// deploy. On a static deploy the route simply 404s and the sitemap never mentions it, but an SSR
// deploy serves `/docs` at a real URL, and robots.txt deliberately does NOT `Disallow` it — a
// `Disallow` would stop the crawler fetching the page and therefore stop it ever reading this
// tag (see src/routes/docs.tsx's header comment, and the matching assertion in verify-build.mjs).
// Delete this tag and `/docs` becomes indexable with no other signal saying otherwise.
const DOCS_ROUTE = 'src/routes/docs.tsx'
const DOCS_ROBOTS_META = /name:\s*(['"])robots\1[\s\S]{0,120}?content:\s*(['"])[^'"]*\bnoindex\b/
if (!existsSync(DOCS_ROUTE)) {
  failures.push(
    `${DOCS_ROUTE}  missing — the docs route is allow-listed in verify-build.mjs and expected here`,
  )
} else if (!DOCS_ROBOTS_META.test(readFileSync(DOCS_ROUTE, 'utf8'))) {
  failures.push(
    `${DOCS_ROUTE}  no \`{ name: 'robots', content: 'noindex, …' }\` meta in the route head — ` +
      `this tag is the ONLY thing keeping /docs out of the index on an SSR deploy (robots.txt ` +
      `deliberately does not Disallow /docs, precisely so crawlers can fetch the page and read it)`,
  )
}

// --- /docs' RECIPES list must name real README headings ---------------------------------------
// `src/shell/docs/config-reference.tsx`'s RECIPES array names README `##` sections verbatim, as
// plain text rather than links (README.md ships in neither `public/` nor `dist/client/`, so a link
// would 404 in every real deployment — see that file's header comment). Plain text is the right
// call and it has a cost: nothing about renaming a README heading tells you that `/docs` still
// points readers at the old name. A developer following a stale pointer finds nothing and
// concludes the docs are unreliable, which is the exact failure the "don't link a 404" decision
// was avoiding in the first place.
//
// Deliberately one-directional: every RECIPES entry must be a README heading, but not every README
// heading need be a recipe (the README also has `## Quick start`, `## Scripts`, `## Contents`,
// `## Architecture in one page` — reference material, not tasks). A two-directional check would
// force every future README section into the /docs list.
const CONFIG_REFERENCE = 'src/shell/docs/config-reference.tsx'
const README = 'README.md'
if (!existsSync(CONFIG_REFERENCE) || !existsSync(README)) {
  failures.push(`${CONFIG_REFERENCE} / ${README}  missing — the RECIPES↔README check needs both`)
} else {
  const refSrc = readFileSync(CONFIG_REFERENCE, 'utf8')
  const recipesBlock = refSrc.match(/const RECIPES\s*=\s*\[([\s\S]*?)\]\s*as const/)?.[1]
  if (!recipesBlock) {
    // Not "no recipes, nothing to check": the array is the thing being verified, so failing to
    // find it must fail loudly rather than vacuously pass. A `const RECIPES` reshaped into
    // something this regex misses is exactly when the coupling stops being watched.
    failures.push(
      `${CONFIG_REFERENCE}  could not locate \`const RECIPES = [...] as const\` — this check ` +
        `verifies every entry names a real README '## ' heading and cannot run without it`,
    )
  } else {
    const recipes = [...recipesBlock.matchAll(/(['"])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2])
    if (recipes.length === 0) {
      failures.push(`${CONFIG_REFERENCE}  RECIPES is empty — it must name README '## ' headings`)
    }
    const headings = new Set(
      readFileSync(README, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('## '))
        .map((l) => l.slice(3).trim()),
    )
    for (const r of recipes) {
      if (!headings.has(r)) {
        failures.push(
          `${CONFIG_REFERENCE}  RECIPES entry '${r}' is not a '## ' heading in ${README} — ` +
            `/docs points developers at a README section that does not exist. Rename the entry ` +
            `to match the heading, or restore the heading.`,
        )
      }
    }
  }
}

if (failures.length) {
  console.error(`\n✗ check-conventions: ${failures.length} violation(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(
  '✓ check-conventions: blocks follow layout primitives, no client-side <Link> in blocks/shell',
)
