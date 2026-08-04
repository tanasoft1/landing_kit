import type { BlockId } from '~/blocks/registry'
import { localePath } from '~/shell/pages/enumerate'
import type { ResolvedPage } from '~/shell/pages/resolve-request'
import type { PageConfig, SiteConfig } from '~/shell/types'
import { buildJsonLd } from './json-ld'

export function buildHead(
  resolved: ResolvedPage<BlockId>,
  site: SiteConfig,
  pages: PageConfig<BlockId>[],
) {
  const { locale, page } = resolved
  const seo = page.seo[locale]
  const canonical = `${site.url}${localePath(page.path, locale, site)}`
  const ogImage = `${site.url}${seo.ogImage ?? '/og-default.jpg'}`
  const title = page.path === '/' ? `${seo.title} · ${site.name}` : `${seo.title} | ${site.name}`

  const alternates = site.locales.map((l) => ({
    rel: 'alternate',
    hrefLang: l,
    href: `${site.url}${localePath(page.path, l, site)}`,
  }))

  return {
    meta: [
      { title },
      { name: 'description', content: seo.description },
      { property: 'og:type', content: 'website' },
      { property: 'og:title', content: title },
      { property: 'og:description', content: seo.description },
      { property: 'og:url', content: canonical },
      { property: 'og:image', content: ogImage },
      { property: 'og:locale', content: locale },
      { property: 'og:site_name', content: site.name },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: seo.description },
      { name: 'twitter:image', content: ogImage },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      ...alternates,
      {
        rel: 'alternate',
        hrefLang: 'x-default',
        href: `${site.url}${localePath(page.path, site.defaultLocale, site)}`,
      },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(buildJsonLd(resolved, site, pages)),
      },
    ],
  }
}
