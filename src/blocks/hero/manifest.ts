import type { BlockManifest } from '~/shell/types'
import { en } from './copy.en'
import { type HeroCopy, mn } from './copy.mn'
import { HeroCentered } from './hero-centered'
import { HeroSplit } from './hero-split'

export const hero = {
  id: 'hero',
  variants: { centered: HeroCentered, split: HeroSplit },
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
