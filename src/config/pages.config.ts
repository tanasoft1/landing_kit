import type { BlockId } from '~/blocks/registry'
import type { PageConfig } from '~/shell/types'

export const pages: PageConfig<BlockId>[] = [
  {
    id: 'home',
    path: '/',
    blocks: ['hero'],
    seo: {
      mn: { title: 'Эхлэл', description: 'Хурдан, хайлтад оновчлогдсон вэб хуудас.' },
      en: { title: 'Home', description: 'A fast, search-optimised landing page.' },
    },
  },
  // TASK 8: uncomment
  // {
  //   id: 'contact',
  //   path: '/contact',
  //   blocks: ['contact'],
  //   seo: {
  //     mn: { title: 'Холбоо барих', description: 'Бидэнтэй холбогдоорой.' },
  //     en: { title: 'Contact', description: 'Get in touch with us.' },
  //   },
  // },
]
