import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type CtaCopy, mn } from './copy.mn'

// No component import here — see `./variants.ts` and hero/manifest.ts's header comment.
export const cta = {
  id: 'cta',
  variantNames: ['banner', 'split'] as const,
  defaultVariant: 'banner',
  copy: { mn, en },
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<CtaCopy, 'banner' | 'split'>
