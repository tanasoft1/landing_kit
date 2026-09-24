import type { SiteConfig } from '@/lib/types'

// Annotated, not `satisfies`. With `satisfies`, `mode: 'light'` narrows to a literal and the
// `site.theme.mode === 'both'` check in vite.config.ts stops type-checking.
export const site: SiteConfig = {
  name: 'Landing Kit',
  url: 'https://example.mn',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  ogImageDefault: '/og-default.jpg',
  organization: { kind: 'Organization', legalName: 'Landing Kit LLC', logo: '/logo.svg' },
  nav: [{ target: 'hero' }, { target: 'contact' }],
  theme: { mode: 'light' },
}
