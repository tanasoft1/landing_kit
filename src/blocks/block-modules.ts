import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Dynamic import per block, keyed by id — one chunk each. `registry.ts` imports manifests
 * eagerly (copy/nav/schema are needed synchronously for the head and JSON-LD); only components
 * are deferred here, since that's the weight (contact alone: 99 KB raw / 30 KB gzip of
 * react-hook-form + zod). Loading registers components into `variant-registry.ts` so
 * `RenderBlocks` can read them back synchronously.
 */
export const blockModules: Record<BlockId, () => Promise<unknown>> = {
  hero: () => import('./hero/variants').then((m) => registerVariants('hero', m.variants)),
  features: () =>
    import('./features/variants').then((m) => registerVariants('features', m.variants)),
  cta: () => import('./cta/variants').then((m) => registerVariants('cta', m.variants)),
  contact: () => import('./contact/variants').then((m) => registerVariants('contact', m.variants)),
}
