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

// `h1`/`h2`/`h3` render in the display face and everything else in the body face (see
// `theme.css`), so the above-the-fold hero — heading AND lead paragraph, both candidates for
// FCP/LCP — can't paint until its two font subsets arrive. Discovery through the `@font-face`
// rule alone happens only after the render-blocking stylesheet is fetched *and* parsed, a
// sequential round trip that Lighthouse's throttled-mobile preset counts as most of the
// hero's "Render Delay" (confirmed against `pnpm lighthouse` while chasing the performance
// budget in Task 9). Preloading the locale-appropriate subsets lets the browser fetch them in
// parallel with the stylesheet instead of waiting for it. Mongolian needs the cyrillic
// subset (it uses Cyrillic-range letters like `ө`/`ү` outside Latin), English the latin one;
// this only covers the two locales this boilerplate ships with.
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
  // One separator for every page, so titles stay visually consistent across the site.
  const title = `${seo.title} · ${site.name}`

  // `hreflang`, not the JSX-conventional `hrefLang`: TanStack's <link> asset spreads these
  // attrs straight onto a React element, and React does not remap `hrefLang` to the real
  // HTML attribute name the way it does e.g. `htmlFor` or `crossOrigin` — it passes an
  // unrecognized-cased key through verbatim, so `hrefLang` would ship literally as
  // `hrefLang="..."` in the markup instead of `hreflang="..."`.
  //
  // Because of that same lack of remapping, React's dev-only DOM validator doesn't
  // recognize this key either, and logs `Invalid DOM property 'hreflang'. Did you mean
  // 'hrefLang'?` on every render in `pnpm dev`. That warning is expected and dev-only —
  // do not "fix" it by renaming this key to `hrefLang`; doing so would silently reintroduce
  // the wrong-case markup this comment exists to prevent. `scripts/verify-build.mjs`
  // asserts the built HTML contains the lowercase `hreflang` attribute, so a regression
  // here (in either direction) fails the build, not just the dev console.
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

  // This page's own block ids, exactly as `src/client.tsx`'s `blocksForCurrentUrl` derives them —
  // knowable statically from `pages.config.ts`. Preloading lets the browser fetch these chunks in
  // parallel with the main chunk instead of discovering them only after it has executed.
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
