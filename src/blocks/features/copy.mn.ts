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
