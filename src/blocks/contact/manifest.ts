import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type ContactCopy, mn } from './copy.mn'

// No component import here — see hero/manifest.ts's header comment. This is the manifest that
// matters most: without this cut, `ContactForm`'s `react-hook-form`/`zod` stay reachable from
// `registry.ts` and the split proves nothing.
const variantNames = ['default'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type ContactVariant = (typeof variantNames)[number]

export const contact = {
  id: 'contact',
  variantNames,
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: `buildJsonLd` (src/lib/seo/json-ld.ts) already emits exactly one `WebPage`
  // node per page — a second, uncoordinated description of it is a bug, not extra markup.
  // `schema` is for markup this block's own content earns (e.g. a future `ContactPoint`), never page identity.
  requires: { npm: ['react-hook-form', 'zod'], ui: [] },
} satisfies BlockManifest<ContactCopy, ContactVariant>
