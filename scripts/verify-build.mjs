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
const ALLOWED_ROUTE_FILES = new Set(['__root.tsx', 'index.tsx', '$.tsx', 'docs.tsx'])
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

// The site's default locale, inferred from `.kit/urls.json` itself rather than hardcoded:
// `localePath` (src/shell/pages/enumerate.ts) never prefixes the default locale's own path
// with its own locale code, while every other locale's path IS prefixed with its code. So the
// first url whose own path doesn't start with `/${its locale}` belongs to the default locale.
const defaultLocale = urls.find((u) => !u.path.startsWith(`/${u.locale}`))?.locale
if (!defaultLocale) fail('urls.json', 'could not infer the default locale from any url path')

// The absolute URL a given hreflang code on a page sharing `pageId` MUST point at — the same
// page, in that code's own locale (or, for 'x-default', the default locale's own path).
// Derived from the manifest so it can't drift from what emit-plugin.ts / build-head.ts
// actually compute; `undefined` means the page simply has no sibling in that locale.
function expectedAlternateHref(pageId, hreflang) {
  const locale = hreflang === 'x-default' ? defaultLocale : hreflang
  const sibling = urls.find((x) => x.pageId === pageId && x.locale === locale)
  return sibling ? `${site}${sibling.path}` : undefined
}

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
 *
 * A numeric reference outside the valid range (`> 0x10FFFF`, or a lone surrogate in
 * `0xD800`–`0xDFFF`) is not a codepoint `String.fromCodePoint` can produce — it throws
 * `RangeError`, and an uncaught throw here takes down the entire verify-build run with a raw
 * stack trace instead of a `✗ verify-build: N failure(s)` line. A real HTML parser leaves an
 * invalid numeric reference as literal text, so `decodeCodePoint` does the same: an out-of-range
 * reference is left untouched rather than converted.
 */
const isValidCodePoint = (cp) => cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)
const decodeCodePoint = (cp, original) =>
  isValidCodePoint(cp) ? String.fromCodePoint(cp) : original
const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => decodeCodePoint(Number.parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec) => decodeCodePoint(Number(dec), m))
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

  // Nothing in the static HTML may be invisible. An entrance animation that ships
  // `opacity:0` leaves a JS-less visitor staring at a blank hero, and defers LCP until the
  // bundle hydrates and animates. See the FadeIn docstring.
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const decl = m[1] ?? ''
    if (/opacity:\s*0(?!\.\d*[1-9])/.test(decl)) {
      fail(u.path, `prerendered HTML contains hidden content: style="${decl}"`)
    }
    if (/visibility:\s*hidden|display:\s*none/.test(decl)) {
      fail(u.path, `prerendered HTML contains hidden content: style="${decl}"`)
    }
  }

  const lang = html.match(/<html[^>]*\blang="([^"]+)"/)?.[1]
  if (lang !== u.locale) fail(u.path, `<html lang> is '${lang}', expected '${u.locale}'`)

  const canonicals = [...html.matchAll(/<link[^>]*rel="canonical"[^>]*>/g)]
  if (canonicals.length !== 1) {
    fail(u.path, `expected exactly 1 canonical, found ${canonicals.length}`)
  } else {
    const href = canonicals[0][0].match(/href="([^"]+)"/)?.[1]
    if (href !== expected) fail(u.path, `canonical is '${href}', expected '${expected}'`)
  }

  // Full tags, not just the hreflang value: presence of the right codes says nothing about
  // where they point, and a regression aiming every alternate at the same URL (or at the
  // wrong locale's path) would still satisfy a check that only counts codes.
  const altTags = [...html.matchAll(/<link[^>]*rel="alternate"[^>]*>/g)].map((m) => ({
    hreflang: m[0].match(/hreflang="([^"]+)"/)?.[1],
    href: m[0].match(/href="([^"]+)"/)?.[1],
  }))
  const hreflangs = new Set(altTags.map((t) => t.hreflang))
  for (const need of EXPECTED_HREFLANG) {
    if (!hreflangs.has(need)) fail(u.path, `missing hreflang '${need}'`)
  }
  // Exactly the expected set, not merely a superset — a stray locale code is a claim
  // about a page that does not exist.
  for (const got of hreflangs) {
    if (!EXPECTED_HREFLANG.has(got)) fail(u.path, `unexpected hreflang '${got}'`)
  }
  for (const tag of altTags) {
    if (!tag.hreflang || !EXPECTED_HREFLANG.has(tag.hreflang)) continue
    const wantHref = expectedAlternateHref(u.pageId, tag.hreflang)
    if (wantHref && tag.href !== wantHref) {
      fail(u.path, `hreflang '${tag.hreflang}' href is '${tag.href}', expected '${wantHref}'`)
    }
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

  // Every page must preload the chunks for the blocks it renders. This is a fragile ordering
  // dependency (see emit-plugin.ts) and its failure mode is silent: the build succeeds, the page
  // works, and only a Lighthouse run weeks later shows the waterfall came back.
  const preloaded = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
    (m) => m[1] ?? '',
  )
  const blockChunks = preloaded.filter((h) => /\/variants-[^/]+\.js$/.test(h))
  if (blockChunks.length === 0) {
    fail(u.path, 'no block chunks preloaded — check plugin ordering in vite.config.ts')
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
    const u = urls[i]
    // Full <xhtml:link> tags, not just hreflang codes — see the matching comment on the
    // <head> check above for why presence-only is not enough.
    const links = [...entry.matchAll(/<xhtml:link[^>]*>/g)].map((m) => ({
      hreflang: m[0].match(/hreflang="([^"]+)"/)?.[1],
      href: m[0].match(/href="([^"]+)"/)?.[1],
    }))
    const langs = new Set(links.map((l) => l.hreflang))
    for (const need of ['mn', 'en', 'x-default']) {
      if (!langs.has(need)) fail('sitemap.xml', `entry ${i + 1} missing hreflang '${need}'`)
    }
    if (!u) return
    for (const link of links) {
      if (!link.hreflang || !EXPECTED_HREFLANG.has(link.hreflang)) continue
      const wantHref = expectedAlternateHref(u.pageId, link.hreflang)
      if (wantHref && link.href !== wantHref) {
        fail(
          'sitemap.xml',
          `entry ${i + 1} hreflang '${link.hreflang}' href is '${link.href}', expected '${wantHref}'`,
        )
      }
    }
  })
}
const robotsPath = join(outDir, 'robots.txt')
if (!existsSync(robotsPath)) {
  fail('robots.txt', 'not emitted')
} else {
  const robots = readFileSync(robotsPath, 'utf8')
  // A bare `Disallow: /` — as opposed to a scoped one like `Disallow: /docs` — deindexes the
  // entire site. Existence-only checking would pass that silently.
  if (!/^Allow: \/[ \t]*$/m.test(robots)) fail('robots.txt', "missing 'Allow: /'")
  if (/^Disallow: \/[ \t]*$/m.test(robots)) {
    fail('robots.txt', "bare 'Disallow: /' would deindex the entire site")
  }
  const wantSitemapLine = `Sitemap: ${site}/sitemap.xml`
  if (!robots.includes(wantSitemapLine)) {
    fail('robots.txt', `missing '${wantSitemapLine}'`)
  }
}

// --- docs route must not ship ---------------------------------------------------
if (existsSync(join(outDir, 'docs/index.html'))) {
  fail('/docs', 'docs route was prerendered; it must be excluded')
}

if (failures.length) {
  console.error(`\n✗ verify-build: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ verify-build: ${urls.length} page(s) passed`)
