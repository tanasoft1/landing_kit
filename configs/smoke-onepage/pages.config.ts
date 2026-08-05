import type { BlockId } from '~/blocks/registry'
import type { PageConfig } from '~/shell/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: [{ id: 'hero', variant: 'split' }, 'contact'],
    seo: {
      mn: { title: 'Эхлэл', description: 'Нэг хуудсан вэб.' },
      en: { title: 'Home', description: 'Single page site.' },
    },
  },
]
