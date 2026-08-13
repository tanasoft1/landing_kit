import type { BlockManifest } from '@/lib/types'
import { en } from './copy.en'
import { type ContactCopy, mn } from './copy.mn'

// No component import here — see `./variants.ts` and hero/manifest.ts's header comment. This is
// the manifest that matters most: without this cut, `ContactForm`'s `react-hook-form`/`zod` stay
// reachable from `registry.ts` and the split proves nothing.
//
// The variant union is derived from `variantNames` (see hero/manifest.ts's comment on why a
// hand-written union alongside the array is a silent-drift compile hole).
const variantNames = ['default'] as const

/** See hero/manifest.ts: `./variants.ts` constrains its component map to exactly this union. */
export type ContactVariant = (typeof variantNames)[number]

export const contact = {
  id: 'contact',
  variantNames,
  defaultVariant: 'default',
  copy: { mn, en },
  nav: { labelKey: 'navLabel' },
  // No `schema`: this block used to emit a `ContactPage` node, but the shell already emits
  // exactly one `WebPage` node per page (see `src/lib/seo/json-ld.ts`) — a second,
  // uncoordinated description of the same page is a bug, not extra markup. `schema` is
  // reserved for markup this block's own content earns (e.g. a future structured contact
  // method via `ContactPoint` embedded on `Organization`), never for page identity.
  requires: { npm: ['react-hook-form', 'zod'], ui: [] },
} satisfies BlockManifest<ContactCopy, ContactVariant>
