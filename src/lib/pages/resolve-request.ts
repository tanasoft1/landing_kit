import type { Locale, PageConfig, SiteConfig } from '@/lib/types'

export type ResolvedPage<Id extends string = string> = {
  locale: Locale
  page: PageConfig<Id>
  path: string
}

/**
 * The single canonical path normalization for the app: drop the query, collapse repeated
 * slashes, drop a trailing slash. Everything downstream must use this result, never a raw
 * pathname — two normalizations agreeing only on clean input is how `//en` becomes a
 * protocol-relative `href="//en"`.
 *
 * Also collapses a trailing `/index.html` to `/`: a host serving prerendered files by literal
 * filename (Lighthouse CI's static server does) leaves `window.location.pathname` as
 * `/index.html` on hydration. Without this the client router finds no route, and the page
 * silently swaps to "Not Found" right after hydrating — invisible on click-through but it
 * tanks LCP, since Lighthouse measures the post-hydration repaint.
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
