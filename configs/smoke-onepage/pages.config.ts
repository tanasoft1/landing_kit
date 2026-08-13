import type { BlockId } from '@/blocks/registry'
import type { PageConfig } from '@/lib/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: [{ id: 'hero', variant: 'split' }, 'features', 'cta', 'contact'],
    seo: {
      mn: { title: 'Эхлэл', description: 'Нэг хуудсан вэб.' },
      en: { title: 'Home', description: 'Single page site.' },
    },
  },
]
