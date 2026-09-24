import interCyrillic from '@fontsource-variable/inter/files/inter-cyrillic-wght-normal.woff2'
import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'
import manropeCyrillic from '@fontsource-variable/manrope/files/manrope-cyrillic-wght-normal.woff2'
import manropeLatin from '@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2'
import type { BlockId } from '@/blocks/registry'
import { localePath } from '@/lib/pages/enumerate'
import type { ResolvedPage } from '@/lib/pages/resolve-request'
import type { Locale, PageConfig, SiteConfig } from '@/lib/types'
import { blockPreloadHrefs } from './block-preloads'
import { buildJsonLd } from './json-ld'

// Preload hero fonts so they load with the CSS, not after it. Mongolian needs the Cyrillic subset.
const CRITICAL_FONTS_BY_LOCALE: Partial<Record<Locale, string[]>> = {
  mn: [manropeCyrillic, interCyrillic],
  en: [manropeLatin, interLatin],
}

export function buildHead(
  resolved: ResolvedPage<BlockId>,
  site: SiteConfig,
  pages: PageConfig<BlockId>[],
) {
  const { locale, page } = resolved
  const seo = page.seo[locale]
  const canonical = `${site.url}${localePath(page.path, locale, site)}`
  const ogImage = `${site.url}${seo.ogImage ?? site.ogImageDefault}`
  const title = `${seo.title} · ${site.name}`

  // Lowercase `hreflang` on purpose. React's dev warning is expected; `hrefLang` would ship
  // wrong-case markup. verify-build checks for it.
  const alternates = site.locales.map((l) => ({
    rel: 'alternate',
    hreflang: l,
    href: `${site.url}${localePath(page.path, l, site)}`,
  }))

  const criticalFontPreloads = (CRITICAL_FONTS_BY_LOCALE[locale] ?? []).map((href) => ({
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href,
    crossOrigin: '',
  }))

  const blockIds = page.blocks.map((b) => (typeof b === 'string' ? b : b.id))
  const modulePreloads = blockPreloadHrefs(blockIds).map((href) => ({
    rel: 'modulepreload',
    href,
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
      ...criticalFontPreloads,
      ...modulePreloads,
      { rel: 'canonical', href: canonical },
      ...alternates,
      {
        rel: 'alternate',
        hreflang: 'x-default',
        href: `${site.url}${localePath(page.path, site.defaultLocale, site)}`,
      },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(buildJsonLd(resolved, site, pages, canonical)),
      },
    ],
  }
}
