import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync('.kit/urls.json', 'utf8'))
const { site, outDir, urls } = manifest
const failures = []
const fail = (where, msg) => failures.push(`${where}: ${msg}`)

// --- registry / folder parity -------------------------------------------------
const blocksDir = 'src/blocks'
const registrySrc = readFileSync(join(blocksDir, 'registry.ts'), 'utf8')

// Strip comments before searching, then search only inside the exported object literal.
// A bare `\bhero\b` over the whole file is satisfied by `// TODO: register hero`, which
// is exactly the half-done state this check exists to catch.
const registryCode = registrySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const registryObject = extractObjectLiteral(registryCode, 'export const registry')
if (!registryObject) fail('registry', 'could not locate the exported registry object literal')

for (const entry of readdirSync(blocksDir)) {
  if (!statSync(join(blocksDir, entry)).isDirectory()) continue
  if (!new RegExp(`\\b${entry}\\b`).test(registryObject ?? '')) {
    fail('registry', `block folder '${entry}' is not registered in the registry object`)
  }
}

// --- route / config parity ----------------------------------------------------
// Pages are defined ONLY in pages.config.ts, and prerendering is driven from that list
// (autoStaticPathsDiscovery is off). So a stray route file is a page that is served but
// never prerendered, never in the sitemap, and never checked by anything below.
// No `routeTree.gen.ts` here: the generated file lives at `src/routeTree.gen.ts`, a sibling of
// this directory, so listing it would be dead weight that reads as though it were expected here.
const ALLOWED_ROUTE_FILES = new Set(['__root.tsx', 'index.tsx', '$.tsx', 'debug.tsx'])
for (const entry of readdirSync('src/routes')) {
  if (!ALLOWED_ROUTE_FILES.has(entry)) {
    fail(
      'routes',
      `unexpected file 'src/routes/${entry}' — pages belong in pages.config.ts; a hand-added route is a page nothing verifies`,
    )
  }
}

// --- per-page HTML assertions -------------------------------------------------
const titles = new Map()
const descriptions = new Map()

const EXPECTED_HREFLANG = new Set(['mn', 'en', 'x-default'])

/**
 * Decode HTML entities generically, including NUMERIC references.
 *
 * This must be general rather than a list of the escapes we happen to have seen. React's
 * SSR serializer escapes an apostrophe as `&#x27;` (hex), while JSON-LD goes out through
 * `dangerouslySetInnerHTML` unescaped — so a title or description containing an apostrophe
 * ("Mongolia's", "we're") would compare unequal and fail a CORRECT build. A false failure in
 * the project's only machine gate is worse than a missing check: it teaches people to
 * distrust the gate.
 *
 * `&amp;` is decoded LAST so that `&amp;lt;` yields `&lt;` rather than `<`.
 */
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * Balanced-brace extraction. A non-greedy `\{([\s\S]*?)\}` stops at the first inner `}`, so
 * one inline object literal in the registry would truncate the captured text and silently
 * stop checking every entry declared after it — reintroducing exactly the hole this check
 * was added to close.
 */
function extractObjectLiteral(src, marker) {
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

for (const u of urls) {
  const file = join(outDir, u.outputPath)
  if (!existsSync(file)) {
    fail(u.path, `missing prerendered file ${file}`)
    continue
  }
  const html = readFileSync(file, 'utf8')
  const expected = `${site}${u.path}`

  const h1s = html.match(/<h1[\s>]/g) ?? []
  if (h1s.length !== 1) fail(u.path, `expected exactly 1 <h1>, found ${h1s.length}`)

  const lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1]
  if (lang !== u.locale) fail(u.path, `<html lang> is '${lang}', expected '${u.locale}'`)

  const canonicals = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*>/g)]
  if (canonicals.length !== 1) {
    fail(u.path, `expected exactly 1 canonical, found ${canonicals.length}`)
  } else {
    const href = canonicals[0][0].match(/href="([^"]+)"/)?.[1]
    if (href !== expected) fail(u.path, `canonical is '${href}', expected '${expected}'`)
  }

  const hreflangs = new Set(
    [...html.matchAll(/<link[^>]*rel="alternate"[^>]*hreflang="([^"]+)"/g)].map((m) => m[1]),
  )
  for (const need of EXPECTED_HREFLANG) {
    if (!hreflangs.has(need)) fail(u.path, `missing hreflang '${need}'`)
  }
  // Exactly the expected set, not merely a superset — a stray locale code is a claim
  // about a page that does not exist.
  for (const got of hreflangs) {
    if (!EXPECTED_HREFLANG.has(got)) fail(u.path, `unexpected hreflang '${got}'`)
  }

  // Decoded, because it is compared against JSON-LD values that were never escaped.
  // Comparing an escaped string to an unescaped one fails on the first apostrophe.
  const title = decodeEntities(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').trim()
  if (!title) fail(u.path, 'empty or missing <title>')
  else {
    if (titles.has(title)) fail(u.path, `duplicate <title> shared with ${titles.get(title)}`)
    titles.set(title, u.path)
  }

  const rawDesc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)?.[1] ?? ''
  // Decode before the emptiness test: content="&nbsp;" survives .trim() but is blank to a reader.
  const desc = decodeEntities(rawDesc).trim()
  if (!desc) fail(u.path, 'empty or missing meta description')
  else {
    if (descriptions.has(desc)) {
      fail(u.path, `duplicate meta description shared with ${descriptions.get(desc)}`)
    }
    descriptions.set(desc, u.path)
  }

  // matchAll, not match: a refactor emitting a second ld+json block must not go unchecked.
  const ldBlocks = [
    ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ].map((m) => m[1])

  if (ldBlocks.length === 0) fail(u.path, 'missing JSON-LD script')
  if (ldBlocks.length > 1) {
    fail(u.path, `expected 1 JSON-LD block, found ${ldBlocks.length} — the graph should be one`)
  }

  for (const [i, block] of ldBlocks.entries()) {
    let parsed
    try {
      parsed = JSON.parse(block)
    } catch (e) {
      fail(u.path, `JSON-LD block ${i + 1} does not parse: ${e.message}`)
      continue
    }

    const graph = parsed['@graph'] ?? []
    const types = new Set(graph.map((n) => n['@type']))
    for (const need of ['WebSite', 'WebPage']) {
      if (!types.has(need)) fail(u.path, `JSON-LD missing @type '${need}'`)
    }
    if (!types.has('Organization') && !types.has('LocalBusiness')) {
      fail(u.path, 'JSON-LD missing Organization or LocalBusiness')
    }

    // @id reference integrity. A node carrying @type DEFINES its @id; a bare { '@id': … }
    // REFERENCES one. A dangling reference parses fine, has all the right @types, and is
    // silently broken for anything that actually resolves the graph — including Google's
    // rich-results parser. This was previously only ever checked by hand.
    const defined = new Set()
    const referenced = []
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      const id = node['@id']
      if (typeof id === 'string') {
        if (node['@type']) defined.add(id)
        else referenced.push(id)
      }
      for (const [k, v] of Object.entries(node)) {
        if (k !== '@id') walk(v)
      }
    }
    walk(graph)
    for (const ref of referenced) {
      if (!defined.has(ref)) fail(u.path, `JSON-LD @id reference '${ref}' resolves to no node`)
    }

    // The head and the graph must describe the same page. Two independent descriptions
    // that disagree is worse than one — and only a comparison catches locale bleed,
    // where e.g. the English copy leaks into the graph on a Mongolian page.
    const webPage = graph.find((n) => n['@type'] === 'WebPage')
    if (webPage) {
      if (typeof webPage.name === 'string' && title && !title.startsWith(webPage.name)) {
        fail(u.path, `JSON-LD WebPage.name '${webPage.name}' does not match <title> '${title}'`)
      }
      if (typeof webPage.description === 'string' && desc && webPage.description !== desc) {
        fail(u.path, 'JSON-LD WebPage.description does not match the meta description')
      }
      if (webPage.url && webPage.url !== expected) {
        fail(u.path, `JSON-LD WebPage.url is '${webPage.url}', expected '${expected}'`)
      }
      if (webPage.inLanguage && webPage.inLanguage !== u.locale) {
        fail(u.path, `JSON-LD inLanguage is '${webPage.inLanguage}', expected '${u.locale}'`)
      }
    }
  }
}

// --- generated files ----------------------------------------------------------
const sitemapPath = join(outDir, 'sitemap.xml')
if (!existsSync(sitemapPath)) fail('sitemap.xml', 'not emitted')
else {
  const xml = readFileSync(sitemapPath, 'utf8')
  for (const u of urls) {
    if (!xml.includes(`<loc>${site}${u.path}</loc>`)) fail('sitemap.xml', `missing ${u.path}`)
  }

  // The sitemap's alternate set must match what the <head> declares, x-default included.
  // Two different answers to "what are this page's alternates" is worse than one.
  const perUrl = xml.split('<url>').slice(1)
  if (perUrl.length !== urls.length) {
    fail('sitemap.xml', `expected ${urls.length} <url> entries, found ${perUrl.length}`)
  }
  perUrl.forEach((entry, i) => {
    const langs = new Set([...entry.matchAll(/hreflang="([^"]+)"/g)].map((m) => m[1]))
    for (const need of ['mn', 'en', 'x-default']) {
      if (!langs.has(need)) fail('sitemap.xml', `entry ${i + 1} missing hreflang '${need}'`)
    }
  })
}
if (!existsSync(join(outDir, 'robots.txt'))) fail('robots.txt', 'not emitted')

// --- debug route must not ship ------------------------------------------------
if (existsSync(join(outDir, 'debug/index.html'))) {
  fail('/debug', 'debug route was prerendered; it must be excluded')
}

if (failures.length) {
  console.error(`\n✗ verify-build: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ verify-build: ${urls.length} page(s) passed`)
