import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type CtaCopy, mn } from './copy.mn'

// No component import here — see `./variants.ts` and hero/manifest.ts's header comment. The
// variant union is derived from `variantNames` (see hero/manifest.ts's comment on why a
// hand-written union alongside the array is a silent-drift compile hole).
const variantNames = ['banner', 'split'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type CtaVariant = (typeof variantNames)[number]

export const cta = {
  id: 'cta',
  variantNames,
  defaultVariant: 'banner',
  copy: { mn, en },
  // `blocks` mirrors the link targets in ./copy.mn.ts and ./copy.en.ts: `primaryCta.target` is
  // 'contact' and `secondaryCta.target` is 'features'. Move this array whenever either copy field's
  // target changes — it is the only written record that this block stops working if either leaves
  // `pages.config.ts` (see `requires` in @/lib/types). `secondaryCta` is optional on `CtaCopy` and
  // only the `split` variant renders it, but both copy files always define it, so the dependency
  // holds for every variant.
  requires: { npm: [], ui: [], blocks: ['contact', 'features'] },
} satisfies BlockManifest<CtaCopy, CtaVariant>
