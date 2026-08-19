export type CtaCopy = {
  heading: string
  lead: string
  primaryCta: { label: string; target: string }
  /** `split` variant shows this alongside the primary; `banner` omits it. */
  secondaryCta?: { label: string; target: string }
}

export const mn: CtaCopy = {
  heading: 'Төслөө эхлүүлэх үү?',
  lead: 'Хүсэлтээ илгээгээрэй, бид ажлын нэг өдөрт хариу барина.',
  primaryCta: { label: 'Холбоо барих', target: 'contact' },
  secondaryCta: { label: 'Боломжууд', target: 'features' },
}

export const en: CtaCopy = {
  heading: 'Ready to start?',
  lead: 'Send us a message and we will reply within one business day.',
  primaryCta: { label: 'Get in touch', target: 'contact' },
  secondaryCta: { label: 'See features', target: 'features' },
}
