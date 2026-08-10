import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
// Relative, NOT `~/` — this module is imported by vite.config.ts, and the `~/` alias is
// defined inside that config, so it does not exist yet while the config is being loaded.
import { enumerateUrls } from '../pages/enumerate'
import type { PageConfig, SiteConfig } from '../types'

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

      const robots = `User-agent: *\nAllow: /\nDisallow: /docs\n\nSitemap: ${site.url}/sitemap.xml\n`

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
