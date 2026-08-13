import type { Locale, PageConfig, SiteConfig } from '@/lib/types'

export type ResolvedPage<Id extends string = string> = {
  locale: Locale
  page: PageConfig<Id>
  path: string
}

/**
 * The single canonical path normalization for the whole app: drop the query,
 * collapse repeated slashes, drop a trailing slash. Everything downstream —
 * including the header's locale switcher — must consume the result of this,
 * never a raw pathname. Two different normalizations that agree only on clean
 * input is how `//en` turns into a protocol-relative `href="//en"`.
 *
 * A trailing `/index.html` is also collapsed to `/` here. Prerendering writes each
 * page to `<outputPath>/index.html`, and any host that serves those files by literal
 * filename rather than rewriting `/` to `index.html` transparently — Lighthouse CI's
 * static-dist server is exactly this, per `lighthouserc.json`'s `url` entries — leaves
 * `window.location.pathname` as `/index.html` on hydration. Without this, the client
 * router finds no route for `/index.html`, falls through to the `$` splat, and
 * `resolveRequest` returns null: the correctly prerendered page silently replaces
 * itself with the "Not Found" UI right after hydrating, which is invisible in a
 * plain click-through but tanks LCP because Lighthouse measures the post-hydration
 * repaint, not the SSR paint.
 */
export function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split('?')[0] ?? '/'
  const withoutIndexHtml = withoutQuery.replace(/\/index\.html$/, '/')
  const collapsed = withoutIndexHtml.replace(/\/{2,}/g, '/')
  const trimmed =
    collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed
  return trimmed || '/'
}

export function resolveRequest<Id extends string>(
  pathname: string,
  pages: PageConfig<Id>[],
  site: SiteConfig,
): ResolvedPage<Id> | null {
  const path = normalizePath(pathname)

  const segments = path.split('/').filter(Boolean)
  const first = segments[0]
  const prefixed = site.locales.find((l) => l !== site.defaultLocale && l === first)

  const locale: Locale = prefixed ?? site.defaultLocale
  const rest = prefixed ? `/${segments.slice(1).join('/')}` : path
  const pagePath = normalizePath(rest)

  const page = pages.find((p) => p.path === pagePath)
  if (!page) return null

  return { locale, page, path }
}
