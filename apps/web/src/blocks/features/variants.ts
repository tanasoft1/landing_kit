import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { FeaturesVariant } from './block'
import type { FeaturesCopy } from './copy'
import { FeaturesAlternating } from './features-alternating'
import { FeaturesGrid } from './features-grid'

// See hero/variants.ts.
export const variants = {
  grid: FeaturesGrid,
  alternating: FeaturesAlternating,
} satisfies Record<FeaturesVariant, ComponentType<BlockProps<FeaturesCopy>>>
