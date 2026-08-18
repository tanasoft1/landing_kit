import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * One dynamic import per block, keyed by id, so each block gets its own chunk. `registry.ts`
 * loads the manifests eagerly, because the head and JSON-LD need copy, nav and schema right
 * away. Only the components wait, because they are the weight — contact alone is 99 KB raw
 * (30 KB gzipped) of react-hook-form and zod. Loading a chunk registers its components in
 * `variant-registry.ts`, where `RenderBlocks` reads them back synchronously.
 */
export const blockModules: Record<BlockId, () => Promise<unknown>> = {
  hero: () => import('./hero/variants').then((m) => registerVariants('hero', m.variants)),
  features: () =>
    import('./features/variants').then((m) => registerVariants('features', m.variants)),
  cta: () => import('./cta/variants').then((m) => registerVariants('cta', m.variants)),
  contact: () => import('./contact/variants').then((m) => registerVariants('contact', m.variants)),
}
