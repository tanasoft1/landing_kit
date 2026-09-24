import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

// One chunk per block. Loading it registers the components for RenderBlocks to read.
export const blockModules: Record<BlockId, () => Promise<unknown>> = {
  hero: () => import('./hero/variants').then((m) => registerVariants('hero', m.variants)),
  features: () =>
    import('./features/variants').then((m) => registerVariants('features', m.variants)),
  cta: () => import('./cta/variants').then((m) => registerVariants('cta', m.variants)),
  contact: () => import('./contact/variants').then((m) => registerVariants('contact', m.variants)),
}
