import { variants as contact } from './contact/variants'
import { variants as cta } from './cta/variants'
import { variants as features } from './features/variants'
import { variants as hero } from './hero/variants'
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
 */
registerVariants('hero', hero)
registerVariants('features', features)
registerVariants('cta', cta)
registerVariants('contact', contact)
