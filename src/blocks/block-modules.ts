import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

/**
 * Dynamic import per block, keyed by id. Vite creates one chunk per entry here.
 *
 * Deliberately separate from `registry.ts`: the registry imports manifests eagerly, because
 * copy, nav labels and schema are needed synchronously to build the head, the JSON-LD graph
 * and the nav. Only the component modules are deferred, and that is where the weight is —
 * `contact` alone is 99 KB raw / 30 KB gzip of react-hook-form and zod.
 *
 * Each entry points at a block's `variants.ts`, not its `manifest.ts` — `manifest.ts` no longer
 * imports its components at all (see each manifest's header comment), so importing it here would
 * split nothing. Loading registers the components into `variant-registry.ts` so `RenderBlocks`
 * can read them back out synchronously once this promise has resolved.
 */
export const blockModules: Record<BlockId, () => Promise<unknown>> = {
  hero: () => import('./hero/variants').then((m) => registerVariants('hero', m.variants)),
  features: () =>
    import('./features/variants').then((m) => registerVariants('features', m.variants)),
  cta: () => import('./cta/variants').then((m) => registerVariants('cta', m.variants)),
  contact: () => import('./contact/variants').then((m) => registerVariants('contact', m.variants)),
}
