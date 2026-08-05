import { lazy } from 'react'
import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type ContactCopy, mn } from './copy.mn'
import { schema } from './schema'

export const contact = {
  id: 'contact',
  variants: {
    default: lazy(() => import('./contact-form').then((m) => ({ default: m.ContactForm }))),
  },
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  schema,
  requires: { npm: ['react-hook-form', 'zod'], ui: [] },
} satisfies BlockManifest<ContactCopy, 'default'>
