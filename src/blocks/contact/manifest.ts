import type { BlockManifest } from '~/shell/types'
import { ContactForm } from './contact-form'
import { en } from './copy.en'
import { type ContactCopy, mn } from './copy.mn'
import { schema } from './schema'

export const contact = {
  id: 'contact',
  variants: { default: ContactForm },
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  schema,
  requires: { npm: ['react-hook-form', 'zod'], ui: [] },
} satisfies BlockManifest<ContactCopy, 'default'>
