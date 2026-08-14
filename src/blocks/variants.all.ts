import { variants as contact } from './contact/variants'
import { variants as cta } from './cta/variants'
import { variants as features } from './features/variants'
import { variants as hero } from './hero/variants'
import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Server-only: the prerenderer needs every block synchronously (one process, no per-page
 * dynamic import like `src/client.tsx`). Must stay unreachable from `src/client.tsx`, or every
 * component lands back in the client bundle.
 *
 * `Record<BlockId, …>` catches a missing block at compile time. Four bare `registerVariants(…)`
 * calls didn't: omitting one still compiled, linted and passed `check-conventions.mjs`, and only
 * failed as a 500 from `getVariants` when the un-prerendered `/docs` gallery rendered it.
 */
const all: Record<BlockId, Parameters<typeof registerVariants>[1]> = {
  hero,
  features,
  cta,
  contact,
}

for (const [id, variants] of Object.entries(all)) registerVariants(id as BlockId, variants)
