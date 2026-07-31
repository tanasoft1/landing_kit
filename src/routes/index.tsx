import { createFileRoute } from '@tanstack/react-router'
import type { registry } from '~/blocks/registry'
import { RenderBlocks } from '~/shell/blocks/render-blocks'
import type { PageConfig, SiteConfig } from '~/shell/types'

export const Route = createFileRoute('/')({ component: Home })

const site = {
  name: 'Landing Kit',
  url: 'https://example.mn',
  defaultLocale: 'mn',
  locales: ['mn', 'en'],
  organization: { kind: 'Organization', logo: '/logo.svg' },
  nav: [],
  theme: { mode: 'both', default: 'light' },
} satisfies SiteConfig

const page: PageConfig<keyof typeof registry> = {
  id: 'home',
  path: '/',
  blocks: ['hero', { id: 'hero', variant: 'split' }],
  seo: {
    mn: { title: 'Эхлэл', description: 'Түр зуурын хуудас' },
    en: { title: 'Home', description: 'Temporary page' },
  },
}

function Home() {
  return <RenderBlocks blocks={page.blocks} locale="mn" site={site} resolve={(t) => `#${t}`} />
}
