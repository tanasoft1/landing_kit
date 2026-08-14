import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type FeaturesCopy, mn } from './copy.mn'

// No component import here — see hero/manifest.ts's header comment.
const variantNames = ['grid', 'alternating'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type FeaturesVariant = (typeof variantNames)[number]

export const features = {
  id: 'features',
  variantNames,
  defaultVariant: 'grid',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: a feature list earns no rich result of its own — see ./hero/manifest.ts.
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<FeaturesCopy, FeaturesVariant>
