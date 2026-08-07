import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'

// No component import here — deliberately. See `./variants.ts` for the component map and
// `~/blocks/block-modules.ts` for why: this manifest is imported eagerly by `registry.ts` because
// the SEO layer needs `copy`/`nav`/`schema` synchronously, but a component import here would put
// every block's component right back on that same eager chain, undoing the split.
export const hero = {
  id: 'hero',
  variantNames: ['centered', 'split'] as const,
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
} satisfies BlockManifest<HeroCopy, 'centered' | 'split'>
