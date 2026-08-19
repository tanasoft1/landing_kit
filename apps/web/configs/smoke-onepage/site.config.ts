import type { SiteConfig } from '@/lib/types'

// Annotated, not `satisfies` — see the note in src/config/site.config.ts. This file is the
// reason: with `satisfies`, `mode: 'light'` narrows to a literal and every
// `site.theme.mode === 'both'` check in vite.config.ts becomes a TS2367 type error.
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
