import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
// Relative path, not `@/`. vite.config.ts imports this before its alias exists.
import { enumerateUrls } from '../pages/enumerate.ts'
import type { PageConfig, SiteConfig } from '../types.ts'

// verify-build requires this stamp. A failed build leaves the old dist/ in place, so the stamp
// proves the last build finished. Kept out of outDir so it is not deployed.
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
    // Do not remove. Without it, `order: 'post'` below still runs before prerendering.
    enforce: 'post',
    buildStart() {
      rmSync(STAMP_PATH, { force: true })
    },
    buildApp: {
      order: 'post',
      async handler() {
        // The manifest was only needed during prerender. Left here, it would be public.
        rmSync(join(outDir, '.vite'), { recursive: true, force: true })

        // Must be the build's last write.
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

          // Must match the alternates in <head>, including x-default.
          const fallback = siblings.find((x) => x.locale === site.defaultLocale)
          if (fallback) lines.push(alternateLink('x-default', fallback.path))

          return `  <url>\n    <loc>${site.url}${u.path}</loc>\n${lines.join('\n')}\n  </url>`
        })
        .join('\n')

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

      // No `Disallow: /docs`. A crawler that cannot fetch /docs never sees its noindex.
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
