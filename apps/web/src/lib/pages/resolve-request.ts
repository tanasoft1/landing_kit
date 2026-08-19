import type { Locale, PageConfig, SiteConfig } from '@/lib/types'

export type ResolvedPage<Id extends string = string> = {
  locale: Locale
  page: PageConfig<Id>
  path: string
}

/**
 * The one place paths get normalized: drop the query, collapse repeated slashes, drop a
 * trailing slash, turn a trailing `/index.html` into `/`.
 *
 * Always use this result, never a raw pathname. Two normalizations that only agree on clean
 * input are how `//en` becomes a protocol-relative `href="//en"`.
 *
 * The `/index.html` rule is for hosts that serve prerendered files by their literal filename.
 * Without it the router matches only the `$` splat and the page flips to "Not Found" right
 * after it hydrates.
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
