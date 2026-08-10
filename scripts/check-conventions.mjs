import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

// Layout rules. These are about who is allowed to WRITE spacing/width/positioning — the answer
// is `<Section>` and `<Container>` and nothing else — so they apply to every directory that
// renders markup, not just `src/blocks`. `README.md`'s Scripts table has always stated the rule
// generally; until this round the scan only ever walked `src/blocks`, so `src/routes/docs.tsx`
// could have written `py-section` or a raw `<section>` and nothing would have said a word.
const LAYOUT_RULES = [
  { re: /\bpy-section\b/, msg: 'py-section belongs to <Section>, not written directly' },
  { re: /\bpx-gutter\b/, msg: 'px-gutter belongs to <Container>, not written directly' },
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
  { re: /\bmin-h-screen\b/, msg: 'min-h-screen — nothing here may assume viewport height' },
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
]

// Blocks-only, and unlike the layout rules above this one genuinely does NOT generalise.
//
// No exception list, unlike the rule this replaced. Heading level is never a block's own
// decision — it depends on whether the block happens to be first on the page, which only the
// renderer knows (`headingLevel` on `BlockProps`, assigned by `RenderBlocks`). A block with a
// heading must do `const H = headingLevel === 1 ? 'h1' : 'h2'` and render `<H>`; a literal
// `<h1>` or `<h2>` anywhere in `src/blocks` — hero included — is always wrong.
//
// A route is the opposite case: it is a fixed page, it knows exactly what it is, and it owns its
// own heading outline. `src/routes/docs.tsx` writes a literal `<h1>Developer docs</h1>` and three
// literal `<h2>`s, correctly — there is no renderer above it assigning levels, because `/docs` is
// not built from `pages.config.ts` blocks. Applying this rule outside `src/blocks` would flag
// correct code, and a gate that flags correct code stops being believed.
const BLOCK_ONLY_RULES = [
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
const CONTENT_RULES = LAYOUT_RULES.filter((r) => r.contentRe)

const failures = []

/**
 * Blank out comment bodies, preserving every newline (so reported line numbers stay exact) and
 * every non-comment character position.
 *
 * Required by the scope widening, not a nicety. These rules match raw line text, and the files
 * that DOCUMENT the layout primitives naturally name them in prose: `src/shell/layout/section.tsx`
 * explains `py-section`, `container.tsx` explains `px-gutter`, `src/shell/docs/block-gallery.tsx`
 * describes what a block's own `<Section>`/`<Container>` render, and `src/routes/docs.tsx:35`
 * opens with a comment about `py-section` being tuned for marketing pages. Every one of those is
 * correct code explaining itself, and every one would have been reported as a violation the moment
 * the scan reached its directory. A false failure in the project's only machine gate teaches
 * people to distrust the gate — the exact failure mode `verify-build.mjs` warns about in its
 * `decodeEntities` docstring.
 *
 * String and template-literal states are tracked so a `//` inside `'https://example.mn'` is not
 * mistaken for a comment — which would blank the rest of a real line of code and hide a genuine
 * violation sitting after it.
 */
function blankComments(text) {
  let out = ''
  let i = 0
  // 'code' | 'line' | 'block' | 'single' | 'double' | 'template'
  let state = 'code'
  while (i < text.length) {
    const c = text[i]
    const next = text[i + 1]
    if (state === 'code') {
      if (c === '/' && next === '/') {
        state = 'line'
        out += '  '
        i += 2
        continue
      }
      if (c === '/' && next === '*') {
        state = 'block'
        out += '  '
        i += 2
        continue
      }
      if (c === "'") state = 'single'
      else if (c === '"') state = 'double'
      else if (c === '`') state = 'template'
      out += c
      i += 1
      continue
    }
    if (state === 'line') {
      if (c === '\n') {
        state = 'code'
        out += c
      } else out += ' '
      i += 1
      continue
    }
    if (state === 'block') {
      if (c === '*' && next === '/') {
        state = 'code'
        out += '  '
        i += 2
        continue
      }
      out += c === '\n' ? c : ' '
      i += 1
      continue
    }
    // Inside a string or template literal: copy verbatim, honouring backslash escapes so an
    // escaped quote does not close the literal early.
    if (c === '\\') {
      out += c + (next ?? '')
      i += 2
      continue
    }
    if (
      (state === 'single' && c === "'") ||
      (state === 'double' && c === '"') ||
      (state === 'template' && c === '`')
    ) {
      state = 'code'
    }
    out += c
    i += 1
  }
  return out
}

function walk(dir, rules, isExempt = () => false) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, rules, isExempt)
    else if (p.endsWith('.tsx') && !isExempt(p)) check(p, rules)
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

function check(file, rules) {
  const text = blankComments(readFileSync(file, 'utf8'))
  const lines = text.split('\n')
  const consts = resolveStringConsts(text)

  lines.forEach((line, i) => {
    for (const rule of rules) {
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

// The two files that DEFINE the layout primitives are the only legitimate authors of the
// utilities the rules ban — `section.tsx` is where `py-section` and the one raw `<section>`
// element belong, `container.tsx` is where `px-gutter`/`max-w-*` belong. Exempting them by exact
// path, not by a `src/shell/layout/` prefix: a third file added to that directory would be a new
// primitive nobody reviewed, and it should have to argue for its exemption explicitly.
const LAYOUT_PRIMITIVES = new Set([
  'src/shell/layout/section.tsx',
  'src/shell/layout/container.tsx',
])
const isLayoutPrimitive = (p) => LAYOUT_PRIMITIVES.has(p.split(sep).join('/'))

walk('src/blocks', [...LAYOUT_RULES, ...BLOCK_ONLY_RULES])
walk('src/routes', LAYOUT_RULES)
walk('src/shell', LAYOUT_RULES, isLayoutPrimitive)

// --- no client-side <Link> anywhere ------------------------------------------------------------
// Block modules are resolved ONCE, off the initial URL, before hydration — see the comment at
// `src/client.tsx`'s `hydrate()` await. A `<Link>` from `@tanstack/react-router` performs a
// client-side transition, which can land on a page whose blocks were never fetched: the block
// renders with a module that was never registered, and `getVariants` throws — with no build-time
// signal. Every navigation on this stack is deliberately a plain `<a href>` (a full page load,
// cheap because every page is prerendered static HTML). That's a recorded design property, not a
// gap, so it's enforced here rather than left to be rediscovered by whoever adds the next nav
// link.
//
// `src/routes` is scanned too, and it is the MOST important directory for this rule, not an
// exempt one. An earlier version of this comment claimed route-level `<Link>` "would legitimately
// belong there"; that was wrong, and wrong in the direction that matters. The mechanism does not
// care which directory the `<Link>` sits in — a `<Link>` in `src/routes/__root.tsx`, the natural
// home for a skip-link or a global nav, transitions client-side to a page whose block modules
// were never fetched, and `getVariants` throws at render exactly as it would from anywhere else.
// Routes are where a global nav would actually be written, so exempting them exempted the one
// file the trap is most likely to be sprung in. `src/router.tsx`'s `defaultPreload: 'intent'` is
// dead config that exists only for `<Link>`, which makes the invitation more tempting still.
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
walkFiles('src/routes', checkNoRouterLink)

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
  '✓ check-conventions: layout primitives in blocks/routes/shell, no literal <h1>/<h2> in blocks, ' +
    'no client-side <Link> anywhere, /docs noindex intact, /docs RECIPES match README headings',
)
