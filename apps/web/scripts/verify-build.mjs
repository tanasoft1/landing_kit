import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// --- build freshness, before anything else ------------------------------------
// A failed build leaves the last good output in dist/. The build writes this stamp only when it
// finishes, so without it every check below would grade stale files.
const STAMP_PATH = '.kit/build-stamp.json'
if (!existsSync(STAMP_PATH)) {
  console.error(
    `\n✗ verify-build: no build stamp at ${STAMP_PATH}.\n\n` +
      '  The last build did not run to completion (or no build has run at all).\n' +
      '  A failed build leaves the PREVIOUS successful output in dist/, so anything this\n' +
      '  script reported about it would describe stale artifacts, not the current source.\n\n' +
      '  Run `pnpm build` and fix the build first; verify-build cannot grade what it has.\n',
  )
  process.exit(1)
}

const manifest = JSON.parse(readFileSync('.kit/urls.json', 'utf8'))
const { site, outDir, urls } = manifest
const failures = []
const fail = (where, msg) => failures.push(`${where}: ${msg}`)

// --- registry / folder parity -------------------------------------------------
const blocksDir = 'src/blocks'
const registrySrc = readFileSync(join(blocksDir, 'registry.ts'), 'utf8')

// Strip comments first, then search only the registry object, so `// TODO: register hero`
// doesn't count as registered.
const registryCode = registrySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
const registryObject = extractObjectLiteral(registryCode, 'export const registry')
if (!registryObject) fail('registry', 'could not locate the exported registry object literal')

for (const entry of readdirSync(blocksDir)) {
  if (!statSync(join(blocksDir, entry)).isDirectory()) continue
  if (!new RegExp(`\\b${entry}\\b`).test(registryObject ?? '')) {
    fail('registry', `block folder '${entry}' is not registered in the registry object`)
  }
}

// --- the scaffold placeholder must be replaced -------------------------------
// A wrong domain breaks every canonical URL, hreflang tag and sitemap entry. The check matches
// one exact sentinel; `.example` is reserved, so it can never be a real site.
const URL_PLACEHOLDER = 'https://your-domain.example'
if (site === URL_PLACEHOLDER) {
  fail(
    'site.config.ts',
    `site.url is still the scaffold placeholder '${URL_PLACEHOLDER}' — set it to the real domain, ` +
      'or every canonical URL, hreflang tag and sitemap entry points at a domain you do not own',
  )
}

// --- route / config parity ----------------------------------------------------
// Pages are defined only in pages.config.ts, and only those are prerendered. A stray route file
// is a page nothing verifies. The panel's routes are allowed only when the project has the panel.
// `.kit/scaffold.json` decides that; if it is missing, fall back to whether `src/admin` exists,
// and if it is unreadable, fail. check-conventions.mjs has the same logic. Change one, change the
// other.
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
      `\n✗ verify-build: cannot read 'backend' from ${RECORD}.\n\n` +
        '  That file records the answers this project was scaffolded with, and it is what\n' +
        '  decides whether this script expects an admin panel shell in dist/ and allows\n' +
        '  `src/routes/admin/`. Guessing would either fail the build over a panel that was\n' +
        '  never asked for, or quietly accept a route nothing else verifies.\n\n' +
        '  Restore it from git, or delete it entirely to fall back to the presence of\n' +
        '  `src/admin/`.\n',
    )
    process.exit(1)
  }
  return backend === 'admin'
}

const HAS_PANEL = scaffoldSaysPanel() && existsSync('src/admin')
const ALLOWED_ROUTE_FILES = new Set([
  '__root.tsx',
  'index.tsx',
  '$.tsx',
  'docs.tsx',
  ...(HAS_PANEL ? ['admin.tsx', 'admin'] : []),
])
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

// The default locale is the one whose paths carry no locale prefix.
const defaultLocale = urls.find((u) => !u.path.startsWith(`/${u.locale}`))?.locale
if (!defaultLocale) fail('urls.json', 'could not infer the default locale from any url path')

// Where an hreflang on this page must point: the same page in that locale. `undefined` means the
// page has no sibling in that locale.
function expectedAlternateHref(pageId, hreflang) {
  const locale = hreflang === 'x-default' ? defaultLocale : hreflang
  const sibling = urls.find((x) => x.pageId === pageId && x.locale === locale)
  return sibling ? `${site}${sibling.path}` : undefined
}

/**
 * Decode HTML entities, including numeric ones. React escapes `'` as `&#x27;` but JSON-LD is not
 * escaped, so titles must be decoded before they are compared. `&amp;` goes last. An invalid
 * code point is left as text instead of throwing.
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

/** Reads to the matching brace, so an inline object in the registry can't cut the match short. */
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

  // Nothing in the static HTML may be invisible: a no-JS visitor would see a blank hero, and LCP
  // would wait for hydration. `scale(0.98)` and `opacity: 0.5` are fine; exactly 0 is not.
  const HIDDEN_PATTERNS = [
    /opacity:\s*0(?!\.\d*[1-9])/,
    /visibility:\s*hidden/,
    /display:\s*none/,
    /transform:[^;]*\bscale(?:3d)?\(\s*0(?!\.\d*[1-9])/,
    /clip-path:\s*inset\(\s*100%/,
  ]
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const decl = m[1] ?? ''
    if (HIDDEN_PATTERNS.some((re) => re.test(decl))) {
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

  // Check where each alternate points, not only that the codes are present.
  const altTags = [...html.matchAll(/<link[^>]*rel="alternate"[^>]*>/g)].map((m) => ({
    hreflang: m[0].match(/hreflang="([^"]+)"/)?.[1],
    href: m[0].match(/href="([^"]+)"/)?.[1],
  }))
  const hreflangs = new Set(altTags.map((t) => t.hreflang))
  for (const need of EXPECTED_HREFLANG) {
    if (!hreflangs.has(need)) fail(u.path, `missing hreflang '${need}'`)
  }
  // Exactly the expected set: a stray locale code claims a page that doesn't exist.
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

  // Decoded, because it is compared with JSON-LD values that were never escaped.
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

    // Every @id reference must resolve. A node with @type defines an @id; a bare { '@id' }
    // references one.
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

    // The head and the graph must describe the same page, in the same language.
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

  // Every page must preload its block chunks. This breaks silently if plugin order changes.
  const preloaded = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
    (m) => m[1] ?? '',
  )
  const blockChunks = preloaded.filter((h) => /\/variants-[^/]+\.js$/.test(h))
  if (blockChunks.length === 0) {
    fail(u.path, 'no block chunks preloaded — check plugin ordering in vite.config.ts')
  }
}

// --- the split actually held --------------------------------------------------
// react-hook-form must not be in the entry chunk, or every page pays for the contact form. The
// markers are option names, not the package name, which the entry chunk contains on purpose. They
// must also appear in some other chunk, so this check can't pass by testing nothing.
const RHF_MARKERS = ['shouldUnregister', 'criteriaMode', 'reValidateMode', 'shouldFocusError']
if (existsSync(join(blocksDir, 'contact'))) {
  const assetsDir = join(outDir, 'assets')
  const entryHrefs = new Set()
  for (const u of urls) {
    const file = join(outDir, u.outputPath)
    if (!existsSync(file)) continue
    const html = readFileSync(file, 'utf8')
    for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
      entryHrefs.add((m[1] ?? '').replace(/^\/+/, ''))
    }
  }
  if (entryHrefs.size === 0) {
    fail(
      'bundle-split',
      'found no <script type="module"> entry in any page — cannot locate the entry chunk',
    )
  }
  const entryFiles = [...entryHrefs].map((h) => join(outDir, h)).filter((p) => existsSync(p))
  const allChunks = existsSync(assetsDir)
    ? readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js'))
        .map((f) => join(assetsDir, f))
    : []
  const nonEntryChunks = allChunks.filter((p) => !entryFiles.includes(p))

  const foundOutside = RHF_MARKERS.filter((marker) =>
    nonEntryChunks.some((p) => readFileSync(p, 'utf8').includes(marker)),
  )
  if (foundOutside.length === 0) {
    fail(
      'bundle-split',
      `none of the react-hook-form markers (${RHF_MARKERS.join(', ')}) appear in any non-entry ` +
        `chunk. Either the library no longer uses these names — in which case this assertion has ` +
        `silently stopped testing anything and the markers must be updated — or the contact block ` +
        `is no longer built. Do not delete this check to make it pass.`,
    )
  }
  for (const entryFile of entryFiles) {
    const code = readFileSync(entryFile, 'utf8')
    const leaked = RHF_MARKERS.filter((marker) => code.includes(marker))
    if (leaked.length > 0) {
      fail(
        'bundle-split',
        `the main entry chunk (${entryFile}) contains react-hook-form (${leaked.join(', ')}). ` +
          `The contact form's dependencies are back in the chunk every page downloads, so pages ` +
          `with no form pay for it — the exact regression the block split exists to prevent. ` +
          `Check that block.ts files import no components and that block-modules.ts is still ` +
          `the only path to them.`,
      )
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

  // `/docs` must never be listed. Paths are parsed, not regex-matched, so a host like
  // `docs.example.mn` or a page like `/docs-guide` isn't a false failure.
  const forbiddenSitemapPaths = new Set([
    '/docs',
    ...new Set(urls.map((u) => `/${u.locale}/docs`)),
    // Only when the panel exists. Without it, `admin` is a fine slug for a public page.
    ...(HAS_PANEL ? ['/admin'] : []),
  ])
  const locPaths = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => {
    const loc = decodeEntities(m[1] ?? '').trim()
    const path = loc.startsWith(site) ? loc.slice(site.length) : loc
    // Normalise a trailing slash so `/docs/` is not a way around this.
    return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path
  })
  for (const path of locPaths) {
    if (forbiddenSitemapPaths.has(path)) {
      fail('sitemap.xml', `lists '${path}' — a noindex route must never be advertised for indexing`)
    }
  }

  // The sitemap's alternates must match the <head>, x-default included.
  const perUrl = xml.split('<url>').slice(1)
  if (perUrl.length !== urls.length) {
    fail('sitemap.xml', `expected ${urls.length} <url> entries, found ${perUrl.length}`)
  }
  perUrl.forEach((entry, i) => {
    const u = urls[i]
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
  // A bare `Disallow: /` deindexes the whole site.
  if (!/^Allow: \/[ \t]*$/m.test(robots)) fail('robots.txt', "missing 'Allow: /'")
  if (/^Disallow: \/[ \t]*$/m.test(robots)) {
    fail('robots.txt', "bare 'Disallow: /' would deindex the entire site")
  }

  // `/docs` must stay crawlable. A crawler that obeys Disallow never reads the page's noindex, and
  // a linked URL then gets indexed anyway.
  const docsDisallow = robots.split('\n').find((line) => /^[ \t]*Disallow:[ \t]*\/docs/i.test(line))
  if (docsDisallow) {
    fail(
      'robots.txt',
      `'${docsDisallow.trim()}' stops crawlers FETCHING /docs, so they never read its 'noindex, nofollow' meta — a URL linked from elsewhere then gets indexed URL-only, the exact outcome the noindex prevents. /docs must stay fetchable; see the header comment in src/routes/docs.tsx`,
    )
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

// --- the admin shell --------------------------------------------------------------
// The Go service serves admin/index.html for every /admin URL. Without it, a hard load of an
// admin page shows the home page instead.
if (HAS_PANEL) {
  const shell = join(outDir, 'admin', 'index.html')
  if (!existsSync(shell)) {
    fail(
      '/admin',
      'this project was scaffolded with --backend=admin and src/admin is present, but dist ' +
        'has no admin/index.html shell — check the /admin prerender entry in vite.config.ts',
    )
  }
}

if (failures.length) {
  console.error(`\n✗ verify-build: ${failures.length} failure(s)\n`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`✓ verify-build: ${urls.length} page(s) passed`)
