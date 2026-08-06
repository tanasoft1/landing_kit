import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type FeaturesCopy, mn } from './copy.mn'
import { FeaturesAlternating } from './features-alternating'
import { FeaturesGrid } from './features-grid'

export const features = {
  id: 'features',
  variants: { grid: FeaturesGrid, alternating: FeaturesAlternating },
  defaultVariant: 'grid',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: a feature list earns no rich result of its own (`FAQPage`, `Product`, `Offer`,
  // `Review`, …), and the shell already emits exactly one `WebPage` node per page — see the same
  // note on ./hero/manifest.ts and ./contact/manifest.ts.
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<FeaturesCopy, 'grid' | 'alternating'>
