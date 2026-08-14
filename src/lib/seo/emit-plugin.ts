import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
// Relative, NOT `@/` — this module is imported by vite.config.ts, and the `@/` alias is
// defined inside that config, so it does not exist yet while the config is being loaded.
import { enumerateUrls } from '../pages/enumerate'
import type { PageConfig, SiteConfig } from '../types'

/**
 * The build stamp `scripts/verify-build.mjs` requires before it will validate anything.
 *
 * A failed build does NOT empty `dist/` — it leaves the previous output sitting there, so a
 * broken build plus a green verify is a real, observed combination (a corrupted
 * `vite.config.ts` once did exactly this). Deleted at `buildStart`, rewritten only once
 * `buildApp` finishes, so its presence means "this `dist/` came from a finished build".
 *
 * Lives in `.kit/`, not `outDir`: `dist/client` is deployed wholesale as the site root, so a
 * stamp there would ship as a served file.
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
    // Load-bearing: Vite buckets plugins by `enforce` before applying a hook's `order` within
    // that bucket. TanStack Start's prerender is a `buildApp` hook on an `enforce: 'post'`
    // plugin; without matching that here, `order: 'post'` alone still runs BEFORE prerendering
    // (confirmed empirically — `dist/client/index.html` didn't exist yet without this line).
    enforce: 'post',
    // Runs before the `buildApp` hook below, on every environment build. Anything that kills the
    // build from here on leaves no stamp, so verify-build won't grade the stale `dist/` that survived.
    buildStart() {
      rmSync(STAMP_PATH, { force: true })
    },
    buildApp: {
      order: 'post',
      async handler() {
        // `block-preloads.ts` reads `.vite/manifest.json` during prerendering, which has
        // finished by the time this hook runs, so it's safe to delete. Left in place it would
        // publish source paths and chunk metadata to the public site root for no benefit.
        rmSync(join(outDir, '.vite'), { recursive: true, force: true })

        // Last write of the build, on purpose: this hook runs after prerendering has finished,
        // so nothing else is left to fail — that's what makes the stamp trustworthy.
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

          // x-default must appear here too, matching the <head>: a sitemap with a different
          // alternate set is a second, conflicting answer, and Google reads both.
          const fallback = siblings.find((x) => x.locale === site.defaultLocale)
          if (fallback) lines.push(alternateLink('x-default', fallback.path))

          return `  <url>\n    <loc>${site.url}${u.path}</loc>\n${lines.join('\n')}\n  </url>`
        })
        .join('\n')

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

      // No `Disallow: /docs`, deliberately — see src/routes/docs.tsx's header comment.
      // `Disallow` and `noindex` don't layer: a crawler that never fetches the page never sees
      // the `noindex`, so it can still get indexed URL-only from an external link.
      // `verify-build.mjs` fails the build if `Disallow: /docs` reappears.
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
