import type { ComponentType } from 'react'
import type { BlockProps } from '~/shell/types'
import type { FeaturesCopy } from './copy.mn'
import { FeaturesAlternating } from './features-alternating'
import { FeaturesGrid } from './features-grid'
import type { FeaturesVariant } from './manifest'

// The only static import of these components anywhere — see hero/variants.ts for why, and for
// why `satisfies Record<FeaturesVariant, …>` (a variant declared in manifest.ts but missing here
// is a compile error, not a silently empty preview on `/docs`).
export const variants = {
  grid: FeaturesGrid,
  alternating: FeaturesAlternating,
} satisfies Record<FeaturesVariant, ComponentType<BlockProps<FeaturesCopy>>>
