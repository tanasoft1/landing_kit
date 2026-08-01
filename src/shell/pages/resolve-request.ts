import type { Locale, PageConfig, SiteConfig } from '~/shell/types'

export type ResolvedPage<Id extends string = string> = {
  locale: Locale
  page: PageConfig<Id>
  path: string
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p
}

export function resolveRequest<Id extends string>(
  pathname: string,
  pages: PageConfig<Id>[],
  site: SiteConfig,
): ResolvedPage<Id> | null {
  const path = stripTrailingSlash(pathname.split('?')[0] ?? '/') || '/'

  const segments = path.split('/').filter(Boolean)
  const first = segments[0]
  const prefixed = site.locales.find((l) => l !== site.defaultLocale && l === first)

  const locale: Locale = prefixed ?? site.defaultLocale
  const rest = prefixed ? `/${segments.slice(1).join('/')}` : path
  const pagePath = stripTrailingSlash(rest) || '/'

  const page = pages.find((p) => p.path === pagePath)
  if (!page) return null

  return { locale, page, path }
}
