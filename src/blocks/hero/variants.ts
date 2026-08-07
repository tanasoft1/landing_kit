import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'

// The only static import of these components anywhere. `manifest.ts` no longer imports them —
// see its header comment — so this module is reachable only via `block-modules.ts`'s dynamic
// import (client) or `variants.all.ts` (server), which is what gives Vite its split point.
export const variants = { centered: HeroCentered, split: HeroSplit }
