import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

// --- layout conventions, checked against the AST -----------------------------------------------
//
// These rules are about who may WRITE spacing/width/positioning — the answer is `<Section>` and
// `<Container>` and nothing else — so they apply to every directory that renders markup, not just
// `src/blocks`.
//
// They are matched against **what they are actually about**: the contents of `className`/`class`
// attributes, and the identity of JSX elements. Not against raw file text.
//
// That difference is the whole design. Matching raw lines let prose join in: `section.tsx`
// explains `py-section`, `container.tsx` explains `px-gutter`. Blanking comments first only
// moved the problem, because a character scanner cannot tell JSX text from code — a bare `//`
// in JSX text blanked the rest of a real line and hid a `min-h-screen` violation, and an
// apostrophe in `<p>don't</p>` opened a string that never closed, so correct code started
// failing. Both were reproduced before this rewrite.
//
// TypeScript's own parser removes that whole class of bug instead of defending against it:
// comments are trivia and never visited, JSX text is a `JsxText` node and never inspected, and
// an apostrophe in it is just a character. `typescript` is already a devDependency, and this
// script runs only in dev and CI, never in the shipped site.
import ts from 'typescript'

// Matched against a resolved class string, never against a line of source.
const CLASS_RULES = [
  { re: /\bpy-section\b/, msg: 'py-section belongs to <Section>, not written directly' },
  { re: /\bpx-gutter\b/, msg: 'px-gutter belongs to <Container>, not written directly' },
  { re: /\bmax-w-/, msg: 'max-width utility — use <Container width="narrow">' },
  { re: /\bcontainer\b/, msg: 'container utility — use <Container>' },
  { re: /\bmin-h-screen\b/, msg: 'min-h-screen — nothing here may assume viewport height' },
  // Catches ANY Tailwind arbitrary-value bracket escape (`text-[length:...]`, `rounded-[...]`,
  // `-left-[9999px]`, etc.), not just a couple of specific utilities — an earlier version matched
  // only `text-[length:` and `rounded-[`, so `-left-[9999px]` (used to hide the contact form's
  // honeypot) sailed straight through review. Use a scale/preset value (e.g. `-left-96`).
  { re: /-\[/, msg: 'arbitrary Tailwind value (bracket syntax) — use a scale/preset utility' },
]

const RAW_SECTION_MSG = 'raw <section> element — use <Section>'
const INLINE_STYLE_MSG = 'inline style — use a Tailwind utility from the token layer'
// Blocks-only, and unlike the rules above this one genuinely does NOT generalise.
//
// Heading level is never a block's own decision. It depends on whether the block is first on
// the page, and only the renderer knows that (`headingLevel` on `BlockProps`, set by
// `RenderBlocks`). A block with a heading writes `const H = headingLevel === 1 ? 'h1' : 'h2'`
// and renders `<H>`. A literal `<h1>` or `<h2>` anywhere in `src/blocks` is always wrong.
//
// A route is the opposite. It is a fixed page, it knows what it is, and it owns its own heading
// outline. `src/routes/docs.tsx` correctly writes a literal `<h1>` and three literal `<h2>`s,
// because no renderer above it assigns levels — `/docs` is not built from blocks. Applying this
// rule outside `src/blocks` would flag correct code, and a gate that does that stops being
// trusted.
const HEADING_MSG =
  "literal <h1>/<h2> — use `const H = headingLevel === 1 ? 'h1' : 'h2'` and render <H>"

const failures = []

function parseTsx(file) {
  return ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TSX,
  )
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1

/**
 * `const NAME = <initializer>` declarations anywhere in the file, so `className={NAME}` and
 * `className={`${MAP[key]}`}` can be resolved to the class strings they actually produce.
 *
 * Flat and scope-blind, as the previous text-based version was: two `const field = …` in different
 * scopes of one file collide, last one winning. The four blocks that copy this pattern should
 * avoid reusing an identifier name across scopes in one file.
 */
function collectConsts(sf) {
  const consts = new Map()
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      consts.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return consts
}

/**
 * Every class string an expression can contribute, each tagged with how it was reached so a
 * failure can name the indirection.
 *
 * Returns `null` for an expression this cannot resolve — a prop, a destructured value, a call into
 * another module. That is reported as a failure rather than skipped: a convention checker that
 * stays quiet about what it cannot verify is worse than one with a narrower reach. `className=
 * {field}` bypassed every rule until that was fixed, and nothing said so.
 */
function classStrings(node, sf, consts, seen = new Set()) {
  if (!node) return []
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ text: node.text, via: null }]
  }
  if (ts.isTemplateExpression(node)) {
    // The literal chunks are class text; each `${…}` is resolved on its own.
    const out = [{ text: node.head.text, via: null }]
    for (const span of node.templateSpans) {
      const inner = classStrings(span.expression, sf, consts, seen)
      if (inner === null) return null
      out.push(...inner, { text: span.literal.text, via: null })
    }
    return out
  }
  // `undefined` / `null` / `false` / `true` contribute no classes and are not "unresolvable" —
  // `className={cond ? 'md:order-2' : undefined}` is the idiomatic way to write "no class here",
  // and reporting it as unverifiable would be a false failure.
  if (
    node.kind === ts.SyntaxKind.NullKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    (ts.isIdentifier(node) && node.text === 'undefined')
  ) {
    return []
  }
  if (ts.isParenthesizedExpression(node)) return classStrings(node.expression, sf, consts, seen)
  if (ts.isConditionalExpression(node)) {
    const a = classStrings(node.whenTrue, sf, consts, seen)
    const b = classStrings(node.whenFalse, sf, consts, seen)
    return a === null || b === null ? null : [...a, ...b]
  }
  if (ts.isBinaryExpression(node)) {
    const a = classStrings(node.left, sf, consts, seen)
    const b = classStrings(node.right, sf, consts, seen)
    return a === null || b === null ? null : [...a, ...b]
  }
  if (ts.isArrayLiteralExpression(node)) {
    const out = []
    for (const el of node.elements) {
      const inner = classStrings(el, sf, consts, seen)
      if (inner === null) return null
      out.push(...inner)
    }
    return out
  }
  // `cn(...)` / `clsx(...)` / `classNames(...)` / `twMerge(...)` and friends: every argument is a
  // candidate class string. Handled generically rather than by helper name, so a project-local
  // wrapper is covered without being enumerated here.
  if (ts.isCallExpression(node)) {
    const out = []
    for (const arg of node.arguments) {
      const inner = classStrings(arg, sf, consts, seen)
      if (inner === null) return null
      out.push(...inner)
    }
    // `['a', 'py-section'].join(' ')` and `arr.join(' ')` keep the class strings in the RECEIVER,
    // not the arguments — scanning arguments alone let that form through. An unresolvable receiver
    // is deliberately NOT fatal here: for a plain `cn(x, 'y')` the callee is a bare function
    // identifier that resolves to nothing, and treating that as unverifiable would report every
    // ordinary helper call as a failure.
    if (ts.isPropertyAccessExpression(node.expression)) {
      const receiver = classStrings(node.expression.expression, sf, consts, seen)
      if (receiver !== null) out.push(...receiver)
    }
    return out
  }
  if (ts.isObjectLiteralExpression(node)) {
    // A lookup map (`const SURFACE_CLASS = { default: 'bg-background', … }`) reached through an
    // unknown key: every value is a class string this element could render, so check them all.
    const out = []
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const inner = classStrings(prop.initializer, sf, consts, seen)
      if (inner === null) return null
      out.push(...inner)
    }
    return out
  }
  if (ts.isIdentifier(node)) {
    if (seen.has(node.text)) return []
    const init = consts.get(node.text)
    if (!init) return null
    const inner = classStrings(init, sf, consts, new Set([...seen, node.text]))
    if (inner === null) return null
    return inner.map((s) => ({ text: s.text, via: s.via ?? node.text }))
  }
  // `MAP[key]` / `MAP.key` — resolve through the base identifier to the whole map.
  if (ts.isElementAccessExpression(node) || ts.isPropertyAccessExpression(node)) {
    return classStrings(node.expression, sf, consts, seen)
  }
  return null
}

function checkFile(file, { headings }) {
  const sf = parseTsx(file)
  const consts = collectConsts(sf)

  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const line = lineOf(sf, node)
      const tag = node.tagName.getText(sf)

      if (tag === 'section') failures.push(`${file}:${line}  ${RAW_SECTION_MSG}`)
      if (headings && (tag === 'h1' || tag === 'h2'))
        failures.push(`${file}:${line}  ${HEADING_MSG}`)

      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue
        const name = attr.name.getText(sf)

        if (name === 'style') {
          failures.push(`${file}:${lineOf(sf, attr)}  ${INLINE_STYLE_MSG}`)
          continue
        }
        if (name !== 'className' && name !== 'class') continue

        const attrLine = lineOf(sf, attr)
        const expr =
          attr.initializer && ts.isJsxExpression(attr.initializer)
            ? attr.initializer.expression
            : attr.initializer
        const strings = classStrings(expr, sf, consts)

        if (strings === null) {
          const shown = expr ? expr.getText(sf) : String(attr.initializer?.getText(sf))
          failures.push(
            `${file}:${attrLine}  className={${shown}} cannot verify — inline the classes or use a literal`,
          )
          continue
        }
        for (const { text, via } of strings) {
          for (const rule of CLASS_RULES) {
            if (rule.re.test(text)) {
              const suffix = via ? ` (via const ${via} = '${text}')` : ''
              failures.push(`${file}:${attrLine}  ${rule.msg}${suffix}`)
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
}

function walk(dir, opts, isExempt = () => false) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, opts, isExempt)
    else if (p.endsWith('.tsx') && !isExempt(p)) checkFile(p, opts)
  }
}

// The two files that DEFINE the layout primitives are the only legitimate authors of the
// utilities the rules ban — `section.tsx` is where `py-section` and the one raw `<section>`
// element belong, `container.tsx` is where `px-gutter`/`max-w-*` belong. Exempting them by exact
// path, not by a `src/components/layout/` prefix: a third file added to that directory would be a
// new primitive nobody reviewed, and it should have to argue for its exemption explicitly.
const LAYOUT_PRIMITIVES = new Set([
  'src/components/layout/section.tsx',
  'src/components/layout/container.tsx',
])
const isLayoutPrimitive = (p) => LAYOUT_PRIMITIVES.has(p.split(sep).join('/'))

walk('src/blocks', { headings: true })
walk('src/routes', { headings: false })
walk('src/components', { headings: false }, isLayoutPrimitive)

// --- src/lib stays .tsx-free --------------------------------------------------------------------
// Nothing above walks `src/lib/`, so a `.tsx` added there would be invisible to the layout
// rules, the heading rule and the `<Link>` ban — and nothing would throw. It would just quietly
// go unchecked. Adding `walk('src/lib', …)` is NOT the fix: `src/lib/` holds only `.ts` files
// today, so that call would pass no matter what, which tells you nothing. Check the rule itself
// instead: no `.tsx` belongs in `src/lib/`.
function findTsxFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) found.push(...findTsxFiles(p))
    else if (p.endsWith('.tsx')) found.push(p)
  }
  return found
}

for (const p of findTsxFiles('src/lib')) {
  failures.push(`${p}  .tsx under src/lib/ — .tsx belongs in src/components/, src/lib/ is .ts only`)
}

// --- no client-side <Link> anywhere ------------------------------------------------------------
// Block modules are loaded ONCE, for the first URL, before hydration — see the comment above
// the `await` in `src/app/client.tsx`. A `<Link>` from `@tanstack/react-router` navigates on the
// client, which can land on a page whose blocks were never fetched: the block renders with a
// module that was never registered and `getVariants` throws, with nothing warning you at build
// time. So every link here is a plain `<a href>`. That is cheap, because every page is
// prerendered static HTML.
//
// `src/routes` is scanned too, and it is the MOST important directory for this rule. The trap
// does not care where the `<Link>` sits: one in `src/routes/__root.tsx` — the natural place for
// a global nav or a skip link — breaks in exactly the same way. Routes are where a global nav
// would actually be written, so exempting them would exempt the likeliest place to get this
// wrong. `src/app/router.tsx` still sets `defaultPreload: 'intent'`, which only matters for
// `<Link>`, making the mistake easier to reach for.
//
// Read from the AST, for the same reason as the layout rules: the regex this replaced matched a
// COMMENTED-OUT import and failed correct code. An `ImportDeclaration` node only exists for a
// real import.
function walkFiles(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkFiles(p, visit)
    else if (p.endsWith('.tsx')) visit(p)
  }
}

function checkNoRouterLink(file) {
  const sf = parseTsx(file)
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
    if (stmt.moduleSpecifier.text !== '@tanstack/react-router') continue
    const bindings = stmt.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    // The imported name as it exists in this module: `Link` or `Link as X` both count, since both
    // put the component in scope.
    const importsLink = bindings.elements.some((el) => (el.propertyName ?? el.name).text === 'Link')
    if (!importsLink) continue
    const line = lineOf(sf, stmt)
    failures.push(
      `${file}:${line}  imports Link from '@tanstack/react-router' — block modules are ` +
        `loaded once, before hydration, for the first URL only (src/app/client.tsx). A ` +
        `client-side transition via <Link> would render a page whose blocks were never ` +
        `registered. Use a plain <a href> instead.`,
    )
  }
}

walkFiles('src/blocks', checkNoRouterLink)
walkFiles('src/components', checkNoRouterLink)
walkFiles('src/routes', checkNoRouterLink)

// --- /docs must keep its `noindex` ------------------------------------------------------------
// Checked in the source, because it CANNOT be checked from `dist/`: `/docs` is never
// prerendered, so `scripts/verify-build.mjs` has no file to read.
//
// This meta tag is the ONLY thing keeping `/docs` out of the search index on an SSR deploy. On a
// static deploy the route 404s and the sitemap never mentions it, but an SSR deploy serves
// `/docs` at a real URL, and robots.txt deliberately does NOT `Disallow` it — a `Disallow` would
// stop the crawler fetching the page, so it would never read this tag. See the header comment in
// src/routes/docs.tsx. Delete the tag and `/docs` becomes indexable with nothing to stop it.
//
// Read from the AST, not with a regex. The regex this replaced passed GREEN when the meta was
// commented out, because a regex cannot tell code from a comment — a silent false pass in the
// one thing protecting `/docs`. In the AST, a commented-out object literal does not exist.
const DOCS_ROUTE = 'src/routes/docs.tsx'

/** `{ name: 'robots', content: '… noindex …' }` as a real object literal anywhere in the module. */
function hasNoindexRobotsMeta(sf) {
  const literalText = (node) => {
    if (!node) return null
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
    return null
  }
  let found = false
  const visit = (node) => {
    if (found) return
    if (ts.isObjectLiteralExpression(node)) {
      let name = null
      let content = null
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key =
          ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : null
        if (key === 'name') name = literalText(prop.initializer)
        else if (key === 'content') content = literalText(prop.initializer)
      }
      if (name === 'robots' && content !== null && /\bnoindex\b/.test(content)) {
        found = true
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return found
}

// Absence is fine: a scaffolded project may delete /docs (README: "Removing the /docs page").
// Presence is not negotiable — if the route is here it must carry the noindex meta.
if (existsSync(DOCS_ROUTE) && !hasNoindexRobotsMeta(parseTsx(DOCS_ROUTE))) {
  failures.push(
    `${DOCS_ROUTE}  no \`{ name: 'robots', content: 'noindex, …' }\` meta in the route head — ` +
      `this tag is the ONLY thing keeping /docs out of the index on an SSR deploy (robots.txt ` +
      `deliberately does not Disallow /docs, precisely so crawlers can fetch the page and read it)`,
  )
}

// --- every preset must define the complete token surface --------------------------------------
// The kit's main claim is that a whole design swaps by changing one `@import` in `theme.css`,
// and the README tells anyone writing a third preset to use "the same variable set".
//
// Getting this wrong fails silently. `@theme inline` maps `--color-ring: var(--c-ring)`, so a
// preset with no `--c-ring` leaves that unresolved. The declaration becomes invalid when the
// value is computed, and the focus outline just does not render. No CSS is malformed, so the
// build stays green. Both presets that ship today are complete, so this check has not caught a
// real break yet — it exists so the next preset cannot introduce one quietly.
const THEME_CSS = 'src/styles/theme.css'
const PRESETS_DIR = 'src/styles/presets'

/**
 * Strip CSS comments, preserving newlines so nothing downstream shifts.
 *
 * Same reason the TSX rules moved to the AST: a commented-out declaration inside `:root` — say a
 * `--c-legacy-accent` kept for reference — was read as a real one and reported as dead weight,
 * failing correct code. CSS is trivially safe to do textually where TSX was not: there are no line
 * comments and no quoting rules that interact with `/* … *\/`.
 */
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))

/** Balanced-brace extraction, so a nested `calc(…)` or a rule inside the block cannot truncate it. */
function extractBlock(src, marker) {
  const start = src.indexOf(marker)
  if (start === -1) return null
  const open = src.indexOf('{', start)
  if (open === -1) return null
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open + 1, i)
  }
  return null
}

if (!existsSync(THEME_CSS) || !existsSync(PRESETS_DIR)) {
  failures.push(
    `${THEME_CSS} / ${PRESETS_DIR}  missing — the preset token-surface check needs both`,
  )
} else {
  const themeInline = extractBlock(
    stripCssComments(readFileSync(THEME_CSS, 'utf8')),
    '@theme inline',
  )
  if (!themeInline) {
    failures.push(`${THEME_CSS}  could not locate the \`@theme inline { … }\` block`)
  } else {
    // Every token the theme layer expects a preset to provide.
    const required = new Set([...themeInline.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]))
    if (required.size === 0) {
      failures.push(
        `${THEME_CSS}  \`@theme inline\` references no var(--…) tokens — check the block`,
      )
    }
    for (const file of readdirSync(PRESETS_DIR)
      .filter((f) => f.endsWith('.css'))
      .sort()) {
      const path = `${PRESETS_DIR}/${file}`
      const css = stripCssComments(readFileSync(path, 'utf8'))
      const root = extractBlock(css, ':root')
      if (!root) {
        failures.push(`${path}  no \`:root { … }\` block — a preset must declare its tokens there`)
        continue
      }
      const declared = new Set([...root.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]))
      for (const token of [...required].sort()) {
        if (!declared.has(token)) {
          failures.push(
            `${path}  does not declare ${token}, which ${THEME_CSS}'s @theme inline maps. The ` +
              `mapped utility resolves to an invalid value and silently renders nothing — a ` +
              `missing --c-ring means no focus outline, a missing --width-page means no page ` +
              `measure, and the build stays green either way.`,
          )
        }
      }
      // Reverse direction: a token no one maps is dead weight. Exempted if the preset itself
      // references it — an author may legitimately build a palette on an internal helper
      // (`--brand-hue`, say) that the theme layer has no business knowing about.
      for (const token of [...declared].sort()) {
        if (required.has(token)) continue
        const referencedInPreset = new RegExp(`var\\(\\s*${token}\\b`).test(css)
        if (!referencedInPreset) {
          failures.push(
            `${path}  declares ${token}, which ${THEME_CSS} never maps and nothing in the preset ` +
              `references — dead weight, or a token whose @theme inline mapping was forgotten`,
          )
        }
      }
    }
  }
}

// --- /docs' RECIPES list must name real README headings ---------------------------------------
// The RECIPES array in `src/components/docs/config-reference.tsx` names README `##` sections
// word for word, as plain text rather than links, because README.md ships in neither `public/`
// nor `dist/client/` and a link would 404. Plain text is the right call, but it has a cost:
// renaming a README heading tells you nothing about `/docs` still pointing at the old name. A
// reader who follows a stale pointer finds nothing and stops trusting the docs.
//
// One-directional on purpose. Every RECIPES entry must be a README heading, but not every README
// heading has to be a recipe — `## Quick start`, `## Scripts` and `## Contents` are reference,
// not tasks. Checking both directions would force every future README section into /docs.
const CONFIG_REFERENCE = 'src/components/docs/config-reference.tsx'
const README = 'README.md'

/** The `const RECIPES = [...] as const` array literal, through the optional `as const`. */
function findRecipesArray(sf) {
  let found = null
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'RECIPES' &&
      node.initializer
    ) {
      let init = node.initializer
      while (ts.isAsExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression
      if (ts.isArrayLiteralExpression(init)) found = init
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return found
}
// Absence is fine: a scaffolded project may delete /docs entirely (README: "Removing the /docs
// page"), and config-reference.tsx goes with it — there is no RECIPES list left to check.
// Presence is not negotiable — if the file is here, README.md must be too, and every entry must
// still name a real heading.
if (existsSync(CONFIG_REFERENCE)) {
  if (!existsSync(README)) {
    failures.push(`${CONFIG_REFERENCE} / ${README}  missing — the RECIPES↔README check needs both`)
  } else {
    // Read off the AST, not with a regex over the source text. The regex collected every quoted
    // string between `const RECIPES = [` and `] as const`, which includes one written inside a
    // comment — `// e.g. 'Adding a widget' would go here` produced a confusing failure about a
    // recipe nobody had declared. Same category as the prose problem the layout rules had: a false
    // failure in the only machine gate. Array elements are array elements; comments are trivia.
    const recipesArray = findRecipesArray(parseTsx(CONFIG_REFERENCE))
    if (!recipesArray) {
      // Not "no recipes, nothing to check": the array is the thing being verified, so failing to
      // find it must fail loudly rather than vacuously pass. A `const RECIPES` reshaped into
      // something this lookup misses is exactly when the coupling stops being watched.
      failures.push(
        `${CONFIG_REFERENCE}  could not locate \`const RECIPES = [...] as const\` — this check ` +
          `verifies every entry names a real README '## ' heading and cannot run without it`,
      )
    } else {
      const recipes = recipesArray.elements
        .filter((el) => ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el))
        .map((el) => el.text)
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
}

// --- README Contents list must mirror the '## ' headings, in both directions -------------------
// The Contents block near the top of README.md is written by hand, not generated, so nothing
// kept it honest. This file already parses README headings for the RECIPES check above, so the
// same parsing is reused here.
//
// Checked in both directions, unlike RECIPES. RECIPES may legitimately name only some headings,
// but a table of contents that misses a real section, or links to one that no longer exists, is
// wrong either way. This is also what catches the CLI: when it trims a kit-only README section
// from a generated project, the leftover Contents entry fails here instead of shipping a dead
// anchor.
//
// Slugs are DERIVED with GitHub's own anchor rule, never listed by hand, so a heading like
// "`/docs`: the living developer reference" — whose backticks, slash and colon all disappear in
// the real anchor — needs no special case.
//
// This mirrors github-slugger (the library GitHub's own renderer uses): lowercase, DELETE
// punctuation and symbols, then replace each remaining space with one hyphen. Three details are
// load-bearing and were each got wrong by an earlier, tighter `[^a-z0-9 -]` allowlist:
//
//   - Letters outside ASCII survive. This kit is bilingual, so "## Монгол хэл" is a heading a
//     developer here will really write; GitHub anchors it #монгол-хэл, and an ASCII-only allowlist
//     slugged it to the empty string and failed a correct README.
//   - Underscores survive (GitHub strips connector punctuation's neighbours, not `_` itself), so
//     "## site_config and env" anchors #site_config-and-env, not #siteconfig-and-env.
//   - Each space is replaced INDIVIDUALLY, never collapsed as a run. "## Blocks & variants" loses
//     the "&" but keeps both spaces around it, so the real anchor is #blocks--variants — two
//     hyphens. The same goes for any " — " or " / " between words.
//
// Written as a deny-list over Unicode property escapes (keep letters, digits, combining marks,
// `_`, `-` and space; delete the rest) so it stays dependency-free — this script has to run inside
// a generated project, where adding an npm package is not an option.
const githubSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\-_ ]+/gu, '')
    .replace(/ /g, '-')

if (existsSync(README)) {
  const readmeLines = readFileSync(README, 'utf8').split('\n')
  const isH2 = (l) => l.startsWith('## ')
  // The '## Contents' heading itself is the list, not an entry within it — a table of contents
  // does not link to itself — so it is excluded from both directions of the comparison below.
  const trackedHeadings = readmeLines
    .filter(isH2)
    .map((l) => l.slice(3).trim())
    .filter((h) => h !== 'Contents')

  const contentsStart = readmeLines.findIndex((l) => l.trim() === '## Contents')
  if (contentsStart === -1) {
    failures.push(`${README}  no '## Contents' heading found — cannot verify the Contents list`)
  } else {
    const nextHeading = readmeLines.findIndex((l, i) => i > contentsStart && isH2(l))
    const contentsBlock = readmeLines.slice(
      contentsStart + 1,
      nextHeading === -1 ? readmeLines.length : nextHeading,
    )
    const entries = contentsBlock
      .map((l) => l.match(/^- \[(.+?)\]\(#([^)]+)\)/))
      .filter((m) => m !== null)
      .map((m) => ({ text: m[1], slug: m[2] }))

    // Direction 1: every heading must be listed. Named by heading, not a generic "out of sync".
    const entrySlugs = new Set(entries.map((e) => e.slug))
    for (const heading of trackedHeadings) {
      const slug = githubSlug(heading)
      if (!entrySlugs.has(slug)) {
        failures.push(
          `${README}  Contents is missing an entry for '## ${heading}' (expected anchor ` +
            `#${slug}) — every '## ' heading must be listed in Contents`,
        )
      }
    }

    // Direction 2: every entry must resolve to a real heading. Named by entry, not by slug alone,
    // so the failure reads as something a person wrote rather than a hash to decode.
    const headingSlugs = new Set(trackedHeadings.map(githubSlug))
    for (const entry of entries) {
      if (!headingSlugs.has(entry.slug)) {
        failures.push(
          `${README}  Contents entry '${entry.text}' points at #${entry.slug}, which is not a ` +
            `'## ' heading — rename the entry to match a real heading, or restore the heading`,
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
  '✓ check-conventions: layout primitives in blocks/routes/components, no literal <h1>/<h2> in ' +
    'blocks, no client-side <Link> anywhere, src/lib is .tsx-free, /docs noindex intact, ' +
    '/docs RECIPES match README headings, README Contents matches headings',
)
