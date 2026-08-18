import type { BlockManifest } from '@/lib/types'
import { en, type FeaturesCopy, mn } from './copy'

// No component import here — see hero/block.ts's header comment.
const variantNames = ['grid', 'alternating'] as const

/** See hero/block.ts: `./variants.ts` constrains its component map to exactly this union. */
export type FeaturesVariant = (typeof variantNames)[number]

export const features = {
  id: 'features',
  variantNames,
  defaultVariant: 'grid',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: a feature list earns no rich result of its own — see ./hero/block.ts.
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<FeaturesCopy, FeaturesVariant>
