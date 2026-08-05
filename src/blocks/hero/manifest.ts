import { lazy } from 'react'
import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'
import { schema } from './schema'

export const hero = {
  id: 'hero',
  variants: {
    centered: lazy(() => import('./hero-centered').then((m) => ({ default: m.HeroCentered }))),
    split: lazy(() => import('./hero-split').then((m) => ({ default: m.HeroSplit }))),
  },
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  schema,
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<HeroCopy, 'centered' | 'split'>
