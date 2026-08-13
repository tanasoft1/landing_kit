import type { ComponentType } from 'react'
import type { BlockProps } from '@/shell/types'
import type { HeroCopy } from './copy.mn'
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'
import type { HeroVariant } from './manifest'

// The only static import of these components anywhere. `manifest.ts` no longer imports them —
// see its header comment — so this module is reachable only via `block-modules.ts`'s dynamic
// import (client) or `variants.all.ts` (server), which is what gives Vite its split point.
//
// `satisfies Record<HeroVariant, …>` is the compile-time half of "every declared variant exists":
// `HeroVariant` is derived from `manifest.ts`'s `variantNames`, so a name added there and not
// here is a type error at this line rather than a variant that renders nothing on `/docs`.
// `satisfies` rather than an annotation, so the inferred per-key component types survive for
// `registerVariants`. The import is `import type`, so this stays a compile-time-only dependency
// and manifest.ts does not join this chunk's runtime graph.
export const variants = {
  centered: HeroCentered,
  split: HeroSplit,
} satisfies Record<HeroVariant, ComponentType<BlockProps<HeroCopy>>>
