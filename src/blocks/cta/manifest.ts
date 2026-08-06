import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type CtaCopy, mn } from './copy.mn'
import { CtaBanner } from './cta-banner'
import { CtaSplit } from './cta-split'

export const cta = {
  id: 'cta',
  variants: { banner: CtaBanner, split: CtaSplit },
  defaultVariant: 'banner',
  copy: { mn, en },
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<CtaCopy, 'banner' | 'split'>
