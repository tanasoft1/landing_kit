import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { HeroCopy } from './copy.mn'
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'
import type { HeroVariant } from './manifest'

// The only place these components are imported statically. `manifest.ts` must not import them
// (see its header comment), so this module is reachable only through `block-modules.ts`'s
// dynamic import on the client, or `variants.all.ts` on the server. That is Vite's split point.
//
// `satisfies Record<HeroVariant, …>` makes every declared variant exist. `HeroVariant` comes
// from `manifest.ts`'s `variantNames`, so a name added there but not here is a type error on
// this line instead of an empty preview on `/docs`. Use `satisfies`, not a type annotation, so
// the per-key component types survive for `registerVariants`. The import is `import type`, so
// manifest.ts stays out of this chunk at runtime.
export const variants = {
  centered: HeroCentered,
  split: HeroSplit,
} satisfies Record<HeroVariant, ComponentType<BlockProps<HeroCopy>>>
