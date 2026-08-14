import type { Locale, PageConfig, SiteConfig } from '@/lib/types'

export type PageUrl = {
  pageId: string
  locale: Locale
  path: string
  outputPath: string
}

export function localePath(path: string, locale: Locale, site: SiteConfig): string {
  if (locale === site.defaultLocale) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function enumerateUrls(pages: PageConfig[], site: SiteConfig): PageUrl[] {
  const urls: PageUrl[] = []
  for (const page of pages) {
    for (const locale of site.locales) {
      const path = localePath(page.path, locale, site)
      urls.push({
        pageId: page.id,
        locale,
        path,
        outputPath: `${path === '/' ? '' : path}/index.html`,
      })
    }
  }
  return urls
}
