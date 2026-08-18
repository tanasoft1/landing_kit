import { variants as contact } from './contact/variants'
import { variants as cta } from './cta/variants'
import { variants as features } from './features/variants'
import { variants as hero } from './hero/variants'
import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Server-only. The prerenderer runs in one process and needs every block at once, so it can't
 * use the per-page dynamic import `src/app/client.tsx` uses. Keep this file unreachable from
 * `src/app/client.tsx`, or every component lands back in the client bundle.
 *
 * `Record<BlockId, …>` makes a missing block a compile error. Plain `registerVariants(…)` calls
 * would not: leaving one out still compiles and lints, and only fails as a 500 when `/docs`
 * renders it.
 */
const all: Record<BlockId, Parameters<typeof registerVariants>[1]> = {
  hero,
  features,
  cta,
  contact,
}

for (const [id, variants] of Object.entries(all)) registerVariants(id as BlockId, variants)
