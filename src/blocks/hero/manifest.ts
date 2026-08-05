import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'
import { schema } from './schema'

export const hero = {
  id: 'hero',
  variants: { centered: HeroCentered, split: HeroSplit },
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  schema,
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<HeroCopy, 'centered' | 'split'>
