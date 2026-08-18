import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { CtaCopy } from './copy.mn'
import { CtaBanner } from './cta-banner'
import { CtaSplit } from './cta-split'
import type { CtaVariant } from './manifest'

// The only place these components are imported statically — see hero/variants.ts for why, and
// for why `satisfies Record<CtaVariant, …>`: a variant declared in manifest.ts but missing here
// becomes a compile error instead of an empty preview on `/docs`.
export const variants = {
  banner: CtaBanner,
  split: CtaSplit,
} satisfies Record<CtaVariant, ComponentType<BlockProps<CtaCopy>>>
