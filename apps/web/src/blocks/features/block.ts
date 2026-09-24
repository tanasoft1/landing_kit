import type { BlockManifest } from '@/lib/types'
import { en, type FeaturesCopy, mn } from './copy'

// No component imports here. See hero/block.ts.
const variantNames = ['grid', 'alternating'] as const

export type FeaturesVariant = (typeof variantNames)[number]

export const features = {
  id: 'features',
  variantNames,
  defaultVariant: 'grid',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
} satisfies BlockManifest<FeaturesCopy, FeaturesVariant>
