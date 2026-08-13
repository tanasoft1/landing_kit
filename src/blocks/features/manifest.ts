import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type FeaturesCopy, mn } from './copy.mn'

// No component import here — see `./variants.ts` and hero/manifest.ts's header comment. The
// variant union is derived from `variantNames` (see hero/manifest.ts's comment on why a
// hand-written union alongside the array is a silent-drift compile hole).
const variantNames = ['grid', 'alternating'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type FeaturesVariant = (typeof variantNames)[number]

export const features = {
  id: 'features',
  variantNames,
  defaultVariant: 'grid',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: a feature list earns no rich result of its own (`FAQPage`, `Product`, `Offer`,
  // `Review`, …), and the shell already emits exactly one `WebPage` node per page — see the same
  // note on ./hero/manifest.ts and ./contact/manifest.ts.
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<FeaturesCopy, FeaturesVariant>
