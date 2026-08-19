import type { BlockManifest } from '@/lib/types'
import { type ContactCopy, en, mn } from './copy'

// No component import here — see hero/block.ts's header comment. This manifest matters most:
// without the cut, `ContactForm` keeps `react-hook-form` and `zod` reachable from `registry.ts`
// and the whole split stops working.
const variantNames = ['default'] as const

/** See hero/block.ts: `./variants.ts` constrains its component map to exactly this union. */
export type ContactVariant = (typeof variantNames)[number]

export const contact = {
  id: 'contact',
  variantNames,
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema` here. `buildJsonLd` (src/lib/seo/json-ld.ts) already emits one `WebPage` node
  // per page, and a second description of the same page is a bug, not extra markup. Use
  // `schema` only for markup this block's own content earns, such as a future `ContactPoint`.
  requires: { npm: ['react-hook-form', 'zod'], ui: [] },
} satisfies BlockManifest<ContactCopy, ContactVariant>
