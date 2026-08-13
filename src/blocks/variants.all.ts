import { variants as contact } from './contact/variants'
import { variants as cta } from './cta/variants'
import { variants as features } from './features/variants'
import { variants as hero } from './hero/variants'
import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Server-only: statically imports and registers every block's components, synchronously.
 *
 * The prerenderer renders every page in one process and can't await a per-page dynamic import
 * before the first render the way `src/client.tsx` does — and it shouldn't have to, since the
 * server was never the thing this split was trying to shrink. This module exists to give the
 * server everything, unconditionally, in the same static way the whole registry used to work.
 *
 * Import this ONLY from `src/server.ts` (or another server-only module). It must stay unreachable
 * from `src/client.tsx` — if the client entry's module graph can reach this file, every component
 * lands back in the client bundle and the split is undone.
 *
 * Registered through a `Record<BlockId, …>` map rather than four bare `registerVariants(…)`
 * statements, because those statements had no completeness constraint of any kind: omit one and
 * the file compiled, linted and passed `check-conventions.mjs` unchanged. Adding a block touches
 * four places, and this was the only one nothing guarded — `registry.ts` (TS, `Record<BlockId, …>`),
 * `block-modules.ts` (TS, `Record<BlockId, …>`) and the block folder itself (`verify-build.mjs`'s
 * folder↔registry parity check) all fail loudly on a miss.
 *
 * The dangerous case is a block registered in `registry.ts` but not yet placed on any page:
 * prerendering never renders it, so `pnpm build` and `verify-build.mjs` both stay green, and the
 * omission surfaces only as a 500 from `getVariants` when `/docs` renders its gallery — a page
 * that is not prerendered, not in the Lighthouse set, and not read by either verification script.
 * `Record<BlockId, …>` makes it a `tsc --noEmit` error at this file instead.
 */
const all: Record<BlockId, Parameters<typeof registerVariants>[1]> = {
  hero,
  features,
  cta,
  contact,
}

for (const [id, variants] of Object.entries(all)) registerVariants(id as BlockId, variants)
