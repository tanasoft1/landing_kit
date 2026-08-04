import type { SiteConfig } from '~/shell/types'

export const site: SiteConfig = {
  name: 'Landing Kit',
  url: 'https://example.mn',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  ogImageDefault: '/og-default.jpg',
  organization: {
    kind: 'LocalBusiness',
    legalName: 'Landing Kit LLC',
    logo: '/logo.svg',
    email: 'hello@example.mn',
    phone: '+976 7000 0000',
    address: { country: 'MN', city: 'Ulaanbaatar', street: 'Peace Avenue 1', postalCode: '14200' },
    sameAs: ['https://www.facebook.com/example'],
  },
  nav: [{ target: 'hero' }],
  theme: { mode: 'both', default: 'light' },
}
