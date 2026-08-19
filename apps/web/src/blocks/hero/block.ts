import type { BlockManifest } from '@/lib/types'
import { en, type HeroCopy, mn } from './copy'

// Never import a component here. `registry.ts` imports every manifest eagerly, because the SEO
// layer needs `copy`, `nav` and `schema` before anything renders. Any component reachable from
// this file joins that eager chain and lands in the main chunk — measured at 334 KB -> 459 KB
// when hero's components pulled in the shared `motion` chunk. Only `contact`'s manifest is
// checked for this automatically, so on every other block the rule is yours to keep.
//
// `variantNames` below is the source of truth. Derive the variant union from it; never write
// that union by hand, because a hand-written one can name a variant this array leaves out and
// still compile, then fail at runtime.
const variantNames = ['centered', 'split'] as const

/**
 * Exported so `./variants.ts` can pin its component map to exactly these names. A variant named
 * here but missing there is then a compile error, not a blank space on `/docs`. `variants.ts`
 * imports it with `import type`, so this never becomes a runtime dependency.
 */
export type HeroVariant = (typeof variantNames)[number]

export const hero = {
  id: 'hero',
  variantNames,
  defaultVariant: 'centered',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema` here. `buildJsonLd` (src/lib/seo/json-ld.ts) already emits one `WebPage` node
  // per page, so a block describing the page again would be a second, conflicting answer. Use
  // `schema` only for markup a block's own content earns, like `FAQPage` or `Product`.
  //
  // `blocks` lists the link targets in ./copy.ts — here, `primaryCta.target`
  // is 'contact'. Update it whenever that target changes. It is the only written record that
  // this block breaks if `contact` leaves `pages.config.ts`, and that break is a blank page that
  // never names the link. See `requires` in @/lib/types. (`secondaryCta.target` is 'hero', this
  // block itself, so it is always satisfied and not listed.)
  requires: { npm: [], ui: [], blocks: ['contact'] },
} satisfies BlockManifest<HeroCopy, HeroVariant>
