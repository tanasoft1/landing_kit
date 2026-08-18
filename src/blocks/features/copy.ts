export type FeatureItem = {
  title: string
  body: string
  /** `alternating` variant only. */
  image?: { src: string; alt: string; width: number; height: number }
}

export type FeaturesCopy = {
  navLabel: string
  heading: string
  lead: string
  items: FeatureItem[]
}

export const mn: FeaturesCopy = {
  navLabel: 'Боломжууд',
  heading: 'Хэрэглэгчээ татах бүх зүйл',
  lead: 'Хурдан ачаалагддаг, хайлтад оновчлогдсон, хоёр хэлээр ажилладаг вэб хуудас.',
  items: [
    {
      title: 'Хайлтад оновчлогдсон',
      body: 'Мета өгөгдөл, sitemap, бүтэцлэгдсэн өгөгдөл автоматаар үүснэ. Google эхний хуудсанд гарах суурь бэлэн.',
    },
    {
      title: 'Хоёр хэл',
      body: 'Монгол, англи хэл дээр зэрэг ажиллана. Хэл солих товч, зөв hreflang шошго бүгд бэлэн.',
    },
    {
      title: 'Хурдан',
      body: 'Бүх хуудас урьдчилан үүсгэгддэг тул сервер шаардлагагүй, ачаалалт шууд.',
    },
  ],
}

export const en: FeaturesCopy = {
  navLabel: 'Features',
  heading: 'Everything you need to convert',
  lead: 'A fast, search-optimised landing page that works in two languages out of the box.',
  items: [
    {
      title: 'Built for search',
      body: 'Metadata, sitemap and structured data are generated from your config. The technical groundwork for ranking is already done.',
    },
    {
      title: 'Bilingual',
      body: 'Mongolian and English side by side, with a locale switcher and correct hreflang tags throughout.',
    },
    {
      title: 'Fast',
      body: 'Every page is prerendered to static HTML, so there is no server to wait for and nothing to cold-start.',
    },
  ],
}
