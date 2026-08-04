import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const manifest = JSON.parse(readFileSync('.kit/urls.json', 'utf8'))
const { site, outDir, urls } = manifest
const failures = []
const fail = (where, msg) => failures.push(`${where}: ${msg}`)

// --- registry / folder parity -------------------------------------------------
const blocksDir = 'src/blocks'
const registrySrc = readFileSync(join(blocksDir, 'registry.ts'), 'utf8')
for (const entry of readdirSync(blocksDir)) {
  if (!statSync(join(blocksDir, entry)).isDirectory()) continue
  if (!new RegExp(`\\b${entry}\\b`).test(registrySrc)) {
    fail('registry', `block folder '${entry}' has no registry entry`)
  }
}

// --- per-page HTML assertions -------------------------------------------------
const titles = new Map()

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
  for (const need of ['mn', 'en', 'x-default']) {
    if (!hreflangs.has(need)) fail(u.path, `missing hreflang '${need}'`)
  }

  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim()
  if (!title) fail(u.path, 'empty or missing <title>')
  else {
    if (titles.has(title)) fail(u.path, `duplicate <title> shared with ${titles.get(title)}`)
    titles.set(title, u.path)
  }

  const desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"/)?.[1]?.trim()
  if (!desc) fail(u.path, 'empty or missing meta description')

  const ld = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!ld) fail(u.path, 'missing JSON-LD script')
  else {
    try {
      const graph = JSON.parse(ld)['@graph'] ?? []
      const types = new Set(graph.map((n) => n['@type']))
      for (const need of ['WebSite', 'WebPage']) {
        if (!types.has(need)) fail(u.path, `JSON-LD missing @type '${need}'`)
      }
      if (!types.has('Organization') && !types.has('LocalBusiness')) {
        fail(u.path, 'JSON-LD missing Organization or LocalBusiness')
      }
    } catch (e) {
      fail(u.path, `JSON-LD does not parse: ${e.message}`)
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
