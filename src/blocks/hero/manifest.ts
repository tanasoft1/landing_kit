import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'

// No component import here — deliberately. This manifest is imported eagerly by `registry.ts`
// (the SEO layer needs `copy`/`nav`/`schema` synchronously), so a component reachable from here
// would join that eager chain and land in the main chunk. Measured cost of getting this wrong:
// main chunk 334,593 -> 459,705 B, because hero's components drag in the shared `motion` chunk.
// Nothing catches it automatically: verify-build.mjs's `bundle-split` assertion only detects this
// for `contact`'s manifest, because it works by watching for react-hook-form markers in the entry.
//
// `variantNames` below is the source of truth; the variant union is derived from it, not
// hand-written alongside it — a hand-written union can list a variant this array omits and
// compile anyway (arrays are covariant), failing only at runtime.
const variantNames = ['centered', 'split'] as const

/**
 * Exported so `./variants.ts` can constrain its component map to exactly these names — a variant
 * declared here but missing from that map is then a compile error, not a blank space on `/docs`.
 * `variants.ts` imports it with `import type`, so this stays out of the runtime graph.
 */
export type HeroVariant = (typeof variantNames)[number]

export const hero = {
  id: 'hero',
  variantNames,
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: `buildJsonLd` (src/lib/seo/json-ld.ts) already emits exactly one `WebPage`
  // node per page, so a block re-describing the page would be a second, conflicting one.
  // `schema` is for markup a block's own content earns (`FAQPage`, `Product`, …), never page identity.
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<HeroCopy, HeroVariant>
