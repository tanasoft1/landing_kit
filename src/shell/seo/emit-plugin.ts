import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
// Relative, NOT `~/` — this module is imported by vite.config.ts, and the `~/` alias is
// defined inside that config, so it does not exist yet while the config is being loaded.
import { enumerateUrls } from '../pages/enumerate'
import type { PageConfig, SiteConfig } from '../types'

/**
 * The build stamp `scripts/verify-build.mjs` requires before it will validate anything.
 *
 * A failed build does NOT empty `dist/` — it leaves the previous successful output sitting there.
 * Every assertion in verify-build is an assertion about the CONTENT of `dist/`, so a build that
 * failed plus a verify that passed is a real, observed combination: a corrupted `vite.config.ts`
 * once broke the build and verify still reported `✓ 4 pages` about artifacts nobody had just
 * produced. The block-chunk-preload assertion is the worst case — it has no failure mode at all
 * other than a fresh build that genuinely lost its preloads.
 *
 * Deleted at `buildStart` and rewritten only at the very end of a `buildApp` that ran to
 * completion, so its presence means exactly one thing: this `dist/` came from a finished build.
 *
 * Lives in `.kit/` (gitignored, next to `urls.json`), NOT in `outDir` — `dist/client` is deployed
 * wholesale as the site's document root, so a stamp in there would be a served file, a candidate
 * for the sitemap, and an unexpected entry for every "nothing extra shipped" check.
 */
const STAMP_PATH = '.kit/build-stamp.json'

export function emitSeoFiles({
  pages,
  site,
  outDir,
}: {
  pages: PageConfig[]
  site: SiteConfig
  outDir: string
}): Plugin {
  return {
    name: 'kit:emit-seo-files',
    apply: 'build',
    // `enforce: 'post'` (plugin-level) combined with the hook-level `order: 'post'` below is
    // load-bearing, not decoration: Vite buckets plugins by `enforce` before it applies a hook's
    // own `order` within that bucket. TanStack Start's own prerender step is a `buildApp` hook on
    // a plugin with `enforce: 'post'`; without matching that here, an `order: 'post'` hook on a
    // normal-enforce plugin (this one, without this line) still runs BEFORE prerendering, not
    // after — confirmed empirically: `dist/client/index.html` did not exist yet when a `buildApp`
    // hook without `enforce: 'post'` fired, and did once this was added. Below, deleting the
    // manifest before every page has read it (see `block-preloads.ts`) would silently empty out
    // every page's `modulepreload` list — this ordering is what prevents that.
    enforce: 'post',
    // Runs at the start of every environment build (client, then server), all of which precede
    // the `buildApp` hook below. Anything that kills the build from here on leaves no stamp, and
    // verify-build refuses to grade the stale `dist/` that survived. See STAMP_PATH above.
    buildStart() {
      rmSync(STAMP_PATH, { force: true })
    },
    buildApp: {
      order: 'post',
      async handler() {
        // `dist/client/.vite/manifest.json` (from `build.manifest: true` in vite.config.ts) is
        // read by `src/shell/seo/block-preloads.ts` during prerendering, above — by the time this
        // hook runs, prerendering (and therefore every read of it) has already finished, so it's
        // safe to remove. Nothing in the shipped client bundle references it; leaving it in
        // `dist/client` would publish source paths and chunk metadata to the public static root
        // for no benefit — it's deployed wholesale as the site's document root.
        rmSync(join(outDir, '.vite'), { recursive: true, force: true })

        // Last write of the whole build, on purpose: this hook is `enforce: 'post'` +
        // `order: 'post'` and this plugin is registered after `tanstackStart()`, so prerendering
        // has already finished successfully by the time we get here. Nothing else is left to
        // fail, which is what makes the stamp's presence trustworthy evidence that `dist/` is
        // current rather than left over from a previous run.
        mkdirSync(dirname(STAMP_PATH), { recursive: true })
        writeFileSync(
          STAMP_PATH,
          `${JSON.stringify({ completedAt: new Date().toISOString(), outDir }, null, 2)}\n`,
          'utf8',
        )
      },
    },
    closeBundle() {
      const urls = enumerateUrls(pages, site)

      const alternateLink = (hreflang: string, path: string) =>
        `    <xhtml:link rel="alternate" hreflang="${hreflang}" href="${site.url}${path}"/>`

      const entries = urls
        .map((u) => {
          const siblings = urls.filter((x) => x.pageId === u.pageId)
          const lines = site.locales
            .map((l) => {
              const alt = siblings.find((x) => x.locale === l)
              return alt ? alternateLink(l, alt.path) : ''
            })
            .filter(Boolean)

          // x-default must appear here too: the <head> declares it, and a sitemap that
          // lists a different alternate set is a second, conflicting answer to the same
          // question. Google reads both.
          const fallback = siblings.find((x) => x.locale === site.defaultLocale)
          if (fallback) lines.push(alternateLink('x-default', fallback.path))

          return `  <url>\n    <loc>${site.url}${u.path}</loc>\n${lines.join('\n')}\n  </url>`
        })
        .join('\n')

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

      // No `Disallow: /docs`, deliberately — see the header comment in `src/routes/docs.tsx`.
      // A `Disallow` and a `noindex` do NOT layer: a crawler obeying the `Disallow` never fetches
      // the page, so it never reads the `noindex`, and a URL linked from elsewhere gets indexed
      // URL-only — the exact outcome the `noindex` exists to prevent. `/docs` must stay fetchable
      // so the `noindex` is actually seen. `scripts/verify-build.mjs` fails the build if a
      // `Disallow` for `/docs` ever comes back.
      const robots = `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`

      const write = (p: string, body: string) => {
        mkdirSync(dirname(p), { recursive: true })
        writeFileSync(p, body, 'utf8')
      }

      write(join(outDir, 'sitemap.xml'), sitemap)
      write(join(outDir, 'robots.txt'), robots)
      write('.kit/urls.json', JSON.stringify({ site: site.url, outDir, urls }, null, 2))
    },
  }
}
