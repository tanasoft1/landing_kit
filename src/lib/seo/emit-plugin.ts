import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin } from 'vite'
// A relative path, NOT `@/`. vite.config.ts imports this module, and the `@/` alias is defined
// inside that config, so it does not exist yet while the config is still loading.
import { enumerateUrls } from '../pages/enumerate.ts'
import type { PageConfig, SiteConfig } from '../types.ts'

/**
 * The build stamp `scripts/verify-build.mjs` requires before it will validate anything.
 *
 * A failed build does NOT empty `dist/`. It leaves the previous output in place, so a broken
 * build with a passing verify is a real combination — a corrupted `vite.config.ts` once did
 * exactly that. This file is deleted at `buildStart` and written again only after `buildApp`
 * finishes, so its presence means "this `dist/` came from a build that completed".
 *
 * It lives in `.kit/`, not in `outDir`, because `dist/client` is deployed as the site root and
 * a stamp there would ship as a public file.
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
    // Do not remove. Vite groups plugins by `enforce` first, and only then applies a hook's
    // `order` inside each group. TanStack Start prerenders from a `buildApp` hook on an
    // `enforce: 'post'` plugin, so without this line `order: 'post'` still runs BEFORE
    // prerendering — checked, and `dist/client/index.html` did not exist yet.
    enforce: 'post',
    // Runs before the `buildApp` hook below, on every environment build. Anything that kills
    // the build after this point leaves no stamp, so verify-build refuses to grade the stale
    // `dist/` that survived.
    buildStart() {
      rmSync(STAMP_PATH, { force: true })
    },
    buildApp: {
      order: 'post',
      async handler() {
        // `block-preloads.ts` reads `.vite/manifest.json` while prerendering, which has already
        // finished by the time this hook runs, so deleting it is safe. Left in place it would
        // publish source paths and chunk names to the public site root for no benefit.
        rmSync(join(outDir, '.vite'), { recursive: true, force: true })

        // The build's last write, on purpose. This hook runs after prerendering, so nothing is
        // left that could still fail. That is what makes the stamp worth trusting.
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

          // x-default has to appear here too, matching the <head>. Google reads both, so a
          // sitemap listing a different set of alternates is a second, conflicting answer.
          const fallback = siblings.find((x) => x.locale === site.defaultLocale)
          if (fallback) lines.push(alternateLink('x-default', fallback.path))

          return `  <url>\n    <loc>${site.url}${u.path}</loc>\n${lines.join('\n')}\n  </url>`
        })
        .join('\n')

      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`

      // No `Disallow: /docs`, on purpose — see src/routes/docs.tsx's header comment. `Disallow`
      // and `noindex` do not stack: a crawler that never fetches the page never sees the
      // `noindex`, so an external link can still get it indexed by URL alone. `verify-build.mjs`
      // fails the build if `Disallow: /docs` comes back.
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
