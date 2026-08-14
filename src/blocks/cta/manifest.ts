import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type CtaCopy, mn } from './copy.mn'

// No component import here — see `./variants.ts` and hero/manifest.ts's header comment. The
// variant union is derived from `variantNames` (see hero/manifest.ts's comment on why a
// hand-written union alongside the array is a silent-drift compile hole).
const variantNames = ['banner', 'split'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type CtaVariant = (typeof variantNames)[number]

export const cta = {
  id: 'cta',
  variantNames,
  defaultVariant: 'banner',
  copy: { mn, en },
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<CtaCopy, CtaVariant>
