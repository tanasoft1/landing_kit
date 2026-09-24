import type { BlockManifest } from '@/lib/types'
import { type ContactCopy, en, mn } from './copy'

// No component imports here (see hero/block.ts). ContactForm would pull its form libraries
// into the main chunk.
const variantNames = ['default'] as const

export type ContactVariant = (typeof variantNames)[number]

export const contact = {
  id: 'contact',
  variantNames,
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: every page already gets a WebPage node.
} satisfies BlockManifest<ContactCopy, ContactVariant>
