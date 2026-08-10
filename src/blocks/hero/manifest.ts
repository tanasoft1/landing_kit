import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'

// No component import here — deliberately. See `./variants.ts` for the component map and
// `~/blocks/block-modules.ts` for why: this manifest is imported eagerly by `registry.ts` because
// the SEO layer needs `copy`/`nav`/`schema` synchronously, but a component import here would put
// every block's component right back on that same eager chain, undoing the split.
//
// The variant union is DERIVED from this array (`(typeof variantNames)[number]` below), not
// hand-written as `'centered' | 'split'` alongside it. `variantNames: readonly V[]` doesn't force
// every member of `V` to appear in the array the way the old `variants: Record<V, Component>` did
// — TS arrays are covariant and don't enforce per-element completeness, so a hand-written union
// listing a variant this array omits compiles with zero errors and fails only at runtime, on
// whichever page requests it. Deriving the union the other direction makes that drift a compile
// error instead: add a name here and it flows into the type; the type can never be wider or
// narrower than the actual list.
const variantNames = ['centered', 'split'] as const

/**
 * Exported so `./variants.ts` can constrain its component map to exactly these names — a variant
 * declared here but missing from that map is then a compile error, not a blank space on `/docs`.
 *
 * The dependency runs variants.ts → manifest.ts and must never be reversed: this module imports
 * no components, which is the entire reason the split exists (see the header comment above).
 * `variants.ts` imports it with `import type`, so nothing is added to the runtime graph either.
 */
export type HeroVariant = (typeof variantNames)[number]

export const hero = {
  id: 'hero',
  variantNames,
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: this block has nothing of its own to say to a rich-results parser. It used to
  // emit a `WebPageElement` describing the whole page, but the shell already emits exactly one
  // `WebPage` node per page (see `src/shell/seo/json-ld.ts`), with its own title and description
  // sourced from `pages.config.ts` — a block re-describing the page is a second, uncoordinated
  // description of the same thing. `schema` is reserved for markup a block's own content earns
  // (`FAQPage`, `Product`, `Offer`, `Review`, …); page identity is never a block's to claim.
  requires: { npm: [], ui: [] },
} satisfies BlockManifest<HeroCopy, HeroVariant>
