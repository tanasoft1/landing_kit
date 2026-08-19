export type HeroCopy = {
  navLabel: string
  eyebrow: string
  heading: string
  lead: string
  primaryCta: { label: string; target: string }
  secondaryCta: { label: string; target: string }
  /** `split` variant only — optional, so `centered` is not forced to supply it. */
  image?: { src: string; alt: string; width: number; height: number }
}

export const mn: HeroCopy = {
  navLabel: 'Эхлэл',
  eyebrow: 'Шинэ',
  heading: 'Бизнесээ онлайнаар хөгжүүл',
  lead: 'Хурдан, хайлтын системд оновчлогдсон вэб хуудсыг хоногийн дотор нэвтрүүл.',
  primaryCta: { label: 'Холбоо барих', target: 'contact' },
  secondaryCta: { label: 'Дэлгэрэнгүй', target: 'hero' },
  image: { src: '/hero.jpg', alt: 'Бүтээгдэхүүний зураг', width: 1200, height: 900 },
}

export const en: HeroCopy = {
  navLabel: 'Home',
  eyebrow: 'New',
  heading: 'Grow your business online',
  lead: 'Ship a fast, search-optimised landing page in a day.',
  primaryCta: { label: 'Get in touch', target: 'contact' },
  secondaryCta: { label: 'Learn more', target: 'hero' },
  image: { src: '/hero.jpg', alt: 'Product screenshot', width: 1200, height: 900 },
}
