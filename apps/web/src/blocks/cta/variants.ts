import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { CtaVariant } from './block'
import type { CtaCopy } from './copy'
import { CtaBanner } from './cta-banner'
import { CtaSplit } from './cta-split'

// See hero/variants.ts.
export const variants = {
  banner: CtaBanner,
  split: CtaSplit,
} satisfies Record<CtaVariant, ComponentType<BlockProps<CtaCopy>>>
