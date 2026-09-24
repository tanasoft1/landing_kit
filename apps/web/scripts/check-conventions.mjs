import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'

// --- layout conventions ---------------------------------------------------------------------------
// Checked on the TypeScript AST, not raw text, so comments and JSX text can't cause false results.
import ts from 'typescript'

// Matched against a resolved class string, never against a line of source.
const CLASS_RULES = [
  { re: /\bpy-section\b/, msg: 'py-section belongs to <Section>, not written directly' },
  { re: /\bpx-gutter\b/, msg: 'px-gutter belongs to <Container>, not written directly' },
  { re: /\bmax-w-/, msg: 'max-width utility — use <Container width="narrow">' },
  { re: /\bcontainer\b/, msg: 'container utility — use <Container>' },
  { re: /\bmin-h-screen\b/, msg: 'min-h-screen — nothing here may assume viewport height' },
  // Any arbitrary bracket value. Use a scale or preset utility instead.
  { re: /-\[/, msg: 'arbitrary Tailwind value (bracket syntax) — use a scale/preset utility' },
]

const RAW_SECTION_MSG = 'raw <section> element — use <Section>'
const INLINE_STYLE_MSG = 'inline style — use a Tailwind utility from the token layer'
// Blocks only. A block can't know if it opens the page, so the renderer picks its heading level.
// Routes are fixed pages and may write literal headings.
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
 * `const NAME = …` declarations, so `className={NAME}` can be resolved to real class strings.
 * Scope-blind: two consts with the same name in one file collide.
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
 * Every class string an expression can produce. Returns `null` when it can't resolve one, and
 * that is reported as a failure, not skipped.
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
  // `undefined`, `null` and booleans add no classes. `cond ? 'x' : undefined` is normal code.
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
  // `cn(...)`, `clsx(...)` and similar: every argument may be a class string.
  if (ts.isCallExpression(node)) {
    const out = []
    for (const arg of node.arguments) {
      const inner = classStrings(arg, sf, consts, seen)
      if (inner === null) return null
      out.push(...inner)
    }
    // `[...].join(' ')` keeps the classes in the receiver. An unresolvable receiver is fine: for
    // `cn(x)` the callee is only a function name.
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

// The two files that define the layout primitives. Listed by exact path, so a new file in that
// folder doesn't get the exemption for free.
const LAYOUT_PRIMITIVES = new Set([
  'src/components/layout/section.tsx',
  'src/components/layout/container.tsx',
])
const isLayoutPrimitive = (p) => LAYOUT_PRIMITIVES.has(p.split(sep).join('/'))

// --- did this project ask for the panel? -------------------------------------------------------
// `.kit/scaffold.json` records the scaffold answers. If it is missing (the kit itself, or an old
// project), fall back to whether `src/admin` exists. If it is there but unreadable, fail: this
// decides which rules run, so it must not guess.
function scaffoldSaysPanel() {
  const RECORD = '.kit/scaffold.json'
  if (!existsSync(RECORD)) return true
  let backend
  try {
    backend = JSON.parse(readFileSync(RECORD, 'utf8')).answers?.backend
  } catch (err) {
    backend = { unreadable: err.message }
  }
  if (typeof backend !== 'string') {
    console.error(
      `\n✗ check-conventions: cannot read 'backend' from ${RECORD}.\n\n` +
        '  That file records the answers this project was scaffolded with, and it is what\n' +
        "  decides whether the admin panel's rule exemptions apply here. Guessing would\n" +
        '  either fail a project over a panel it never asked for, or switch off the rules\n' +
        '  that keep a hand-added route out of `src/routes/admin/`.\n\n' +
        '  Restore it from git, or delete it entirely to fall back to the presence of\n' +
        '  `src/admin/`.\n',
    )
    process.exit(1)
  }
  return backend === 'admin'
}

// The panel exemptions below apply only when the project really has the panel. Otherwise a
// team's own `src/routes/admin/` would silently skip the rules. verify-build.mjs has the same
// logic. Change one, change the other.
const HAS_PANEL = scaffoldSaysPanel() && existsSync('src/admin')

// The panel's routes: `src/routes/admin.tsx` and everything under `src/routes/admin/`.
const isAdminRoute = (p) => {
  if (!HAS_PANEL) return false
  const rel = p.split(sep).join('/')
  return rel === 'src/routes/admin.tsx' || rel.startsWith('src/routes/admin/')
}

walk('src/blocks', { headings: true })
// The panel's routes skip every layout rule. It is a shadcn app with its own spacing, so the
// <Section>/<Container> rules don't fit. The bracket, inline-style and className checks are
// skipped there too, which is an accepted trade.
walk('src/routes', { headings: false }, isAdminRoute)
walk('src/components', { headings: false }, isLayoutPrimitive)

// --- src/lib stays .tsx-free --------------------------------------------------------------------
// Nothing walks src/lib, so a .tsx there would skip every rule above.
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
// Block modules load once, for the first URL, before hydration (src/app/client.tsx). A client-side
// <Link> can land on a page whose blocks never loaded, so use a plain <a href>. Routes are checked
// too: a global nav in __root.tsx is the likeliest place for this mistake.
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
    // `Link` and `Link as X` both count.
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
// The admin panel is exempt: it renders no blocks, and it is a real SPA.
walkFiles('src/routes', (file) => {
  if (!isAdminRoute(file)) checkNoRouterLink(file)
})

// --- /docs and /admin must keep their `noindex` -----------------------------------------------
// Checked in the source because neither route is prerendered. robots.txt doesn't Disallow them on
// purpose, so crawlers can read this tag. Without it the route becomes indexable.
const NOINDEX_ROUTES = ['src/routes/docs.tsx', 'src/routes/admin.tsx']

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

for (const route of NOINDEX_ROUTES) {
  // A project may delete /docs, and one without the panel has no admin.tsx. If the file exists,
  // it needs the tag.
  if (existsSync(route) && !hasNoindexRobotsMeta(parseTsx(route))) {
    failures.push(
      `${route}  no \`{ name: 'robots', content: 'noindex, …' }\` meta in the route head — ` +
        `this tag is the ONLY thing keeping the route out of the index on an SSR deploy ` +
        `(robots.txt deliberately does not Disallow it, precisely so crawlers can fetch the ` +
        `page and read it)`,
    )
  }
}

// --- the panel never sets raw HTML -------------------------------------------------------------
// Lead fields come from a public form, and the panel holds an access token.
function checkNoDangerousHtml(file) {
  const sf = parseTsx(file)
  const visit = (node) => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'dangerouslySetInnerHTML'
    ) {
      failures.push(
        `${file}:${lineOf(sf, node)}  dangerouslySetInnerHTML in the admin panel — lead ` +
          `name, email, message and user agent are all attacker-controlled, and this page holds ` +
          `a valid access token. Render the value as a child and let React escape it.`,
      )
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
}

if (HAS_PANEL) walkFiles('src/admin', checkNoDangerousHtml)
walkFiles('src/routes', (file) => {
  if (isAdminRoute(file)) checkNoDangerousHtml(file)
})

// --- every preset must define the complete token surface --------------------------------------
// A preset missing a token (say --c-ring) fails silently: the utility renders nothing and the
// build stays green.
const THEME_CSS = 'src/styles/theme.css'
const PRESETS_DIR = 'src/styles/presets'

/** Strip CSS comments, keeping newlines so line numbers don't shift. */
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
      // Reverse direction: a token nothing maps is dead weight, unless the preset uses it itself.
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
// One direction only: every recipe must be a heading, but not every heading is a recipe.
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
// A project may delete /docs. If config-reference.tsx is here, every entry must name a heading.
if (existsSync(CONFIG_REFERENCE)) {
  if (!existsSync(README)) {
    failures.push(`${CONFIG_REFERENCE} / ${README}  missing — the RECIPES↔README check needs both`)
  } else {
    const recipesArray = findRecipesArray(parseTsx(CONFIG_REFERENCE))
    if (!recipesArray) {
      // Fail loudly: a missing array means the check silently stopped running.
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
// Slugs follow GitHub's anchor rule (github-slugger): lowercase, delete punctuation, and turn each
// space into one hyphen. Non-ASCII letters and underscores survive, and spaces are not collapsed,
// so "## Blocks & variants" becomes #blocks--variants.
const githubSlug = (text) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\-_ ]+/gu, '')
    .replace(/ /g, '-')

if (existsSync(README)) {
  const readmeLines = readFileSync(README, 'utf8').split('\n')
  const isH2 = (l) => l.startsWith('## ')
  // '## Contents' is the list itself, so it isn't tracked.
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

    // Direction 2: every entry must resolve to a real heading.
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
    'blocks, no client-side <Link> outside the panel, src/lib is .tsx-free, /docs and /admin ' +
    'noindex intact, no dangerouslySetInnerHTML in the panel, /docs RECIPES match README ' +
    'headings, README Contents matches headings',
)
