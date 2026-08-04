import { mkdirSync, writeFileSync } from 'node:fs'
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
    closeBundle() {
      const urls = enumerateUrls(pages, site)

      const entries = urls
        .map((u) => {
          const alternates = site.locales
            .map((l) => {
              const alt = urls.find((x) => x.pageId === u.pageId && x.locale === l)
              return alt
                ? `    <xhtml:link rel="alternate" hreflang="${l}" href="${site.url}${alt.path}"/>`
                : ''
            })
            .filter(Boolean)
            .join('\n')
          return `  <url>\n    <loc>${site.url}${u.path}</loc>\n${alternates}\n  </url>`
        })
        .join('\n')

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

      const robots = `User-agent: *\nAllow: /\nDisallow: /debug\n\nSitemap: ${site.url}/sitemap.xml\n`

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
