import { registry } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { Container } from '~/shell/layout/container'
import { localePath } from '~/shell/pages/enumerate'
import { normalizePath } from '~/shell/pages/resolve-request'
import type { Locale, SiteConfig } from '~/shell/types'
import { ThemeToggle } from '~/theme'

function labelFor(target: string, locale: Locale): string {
  const page = pages.find((p) => p.id === target)
  if (page) return page.seo[locale].title

  const manifest = registry[target as keyof typeof registry]
  if (manifest?.nav) {
    const copy = manifest.copy[locale] as Record<string, unknown>
    const label = copy[manifest.nav.labelKey]
    if (typeof label === 'string') return label
  }
  return target
}

export function Header({
  site,
  locale,
  path,
  resolve,
}: {
  site: SiteConfig
  locale: Locale
  path: string
  resolve: (target: string) => string
}) {
  const others = site.locales.filter((l) => l !== locale)
  const navLabel = locale === 'mn' ? 'Үндсэн цэс' : 'Main navigation'

  const pageLinks = site.nav.map((item) => (
    <a
      key={item.target}
      href={resolve(item.target)}
      className="hover:text-primary flex min-h-11 items-center"
    >
      {labelFor(item.target, locale)}
    </a>
  ))

  const localeLinks = others.map((l) => (
    <a
      key={l}
      href={switchLocale(path, locale, l, site)}
      hrefLang={l}
      className="text-muted-foreground hover:text-primary flex min-h-11 items-center uppercase"
    >
      {l}
    </a>
  ))

  const themeToggle = <ThemeToggle label={locale === 'mn' ? 'Өнгө хувиргах' : 'Toggle theme'} />

  return (
    <header className="border-border bg-background/80 sticky top-0 z-50 border-b backdrop-blur">
      <Container className="flex items-center justify-between gap-4 py-3">
        <a
          href={localePath('/', locale, site)}
          className="font-display flex min-h-11 items-center font-bold"
        >
          {site.name}
        </a>

        <nav aria-label={navLabel} className="hidden items-center gap-6 text-sm md:flex">
          {pageLinks}
          {localeLinks}
          {themeToggle}
        </nav>

        <details className="relative md:hidden">
          <summary
            aria-label={locale === 'mn' ? 'Цэс' : 'Menu'}
            className="border-border rounded-base flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center border [&::-webkit-details-marker]:hidden"
          >
            <span aria-hidden="true" className="text-lg leading-none">
              ☰
            </span>
          </summary>
          <nav
            aria-label={navLabel}
            // `shadow-card`, not Tailwind's `shadow-lg`: `shadow-card` maps to the preset's own
            // `--elevation-card`, so the mobile menu's elevation moves with a preset swap the way
            // every other surface does. `shadow-lg` is a fixed palette value that would not.
            className="border-border bg-background rounded-base shadow-card absolute right-0 z-50 mt-2 flex w-56 flex-col border p-3 text-sm"
          >
            {pageLinks}
            <span className="border-border my-2 border-t" aria-hidden="true" />
            {localeLinks}
            {themeToggle}
          </nav>
        </details>
      </Container>
    </header>
  )
}

function switchLocale(path: string, from: Locale, to: Locale, site: SiteConfig): string {
  if (from === site.defaultLocale) return localePath(normalizePath(path), to, site)

  // Strip the locale by segment, matching how resolveRequest reads it — not with a
  // prefix regex, which silently fails to match on any non-canonical path.
  const segments = normalizePath(path).split('/').filter(Boolean)
  const bare = `/${segments.slice(1).join('/')}`
  return localePath(normalizePath(bare), to, site)
}
