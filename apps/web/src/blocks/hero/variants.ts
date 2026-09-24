import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { HeroVariant } from './block'
import type { HeroCopy } from './copy'
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'

// The only static import of these components; this file is the code-split point.
// Use `satisfies`, not a type annotation, so every variant name must have a component.
export const variants = {
  centered: HeroCentered,
  split: HeroSplit,
} satisfies Record<HeroVariant, ComponentType<BlockProps<HeroCopy>>>
