import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type CtaCopy, mn } from './copy.mn'

// No component import here — see `./variants.ts` and hero/manifest.ts's header comment. The
// variant union is derived from `variantNames`; hero/manifest.ts explains why writing that
// union by hand lets it drift without a compile error.
const variantNames = ['banner', 'split'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type CtaVariant = (typeof variantNames)[number]

export const cta = {
  id: 'cta',
  variantNames,
  defaultVariant: 'banner',
  copy: { mn, en },
  // `blocks` lists the link targets in ./copy.mn.ts and ./copy.en.ts — here, `primaryCta.target`
  // is 'contact' and `secondaryCta.target` is 'features'. Update it whenever either target
  // changes. It is the only written record that this block breaks if either one leaves
  // `pages.config.ts`; see `requires` in @/lib/types. `secondaryCta` is optional on `CtaCopy` and
  // only the `split` variant renders it, but both copy files always set it, so both variants
  // depend on it.
  requires: { npm: [], ui: [], blocks: ['contact', 'features'] },
} satisfies BlockManifest<CtaCopy, CtaVariant>
