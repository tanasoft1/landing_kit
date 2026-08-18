import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { FeaturesVariant } from './block'
import type { FeaturesCopy } from './copy'
import { FeaturesAlternating } from './features-alternating'
import { FeaturesGrid } from './features-grid'

// The only place these components are imported statically — see hero/variants.ts for why, and
// for why `satisfies Record<FeaturesVariant, …>`: a variant declared in block.ts but missing
// here becomes a compile error instead of an empty preview on `/docs`.
export const variants = {
  grid: FeaturesGrid,
  alternating: FeaturesAlternating,
} satisfies Record<FeaturesVariant, ComponentType<BlockProps<FeaturesCopy>>>
