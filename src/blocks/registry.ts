import type { BlockManifest } from '~/shell/types'
import { hero } from './hero/manifest'

// `BlockManifest<any, any>` here is not "no type checking" — each manifest is precisely
// typed at its own definition site (e.g. `satisfies BlockManifest<HeroCopy, 'centered' | 'split'>`
// in ./hero/manifest.ts). This line only needs to prove every entry *is* a manifest; using
// `unknown` instead would collapse `keyof C` and break the `nav.labelKey` constraint.
export const registry = {
  hero,
} satisfies Record<string, BlockManifest<any, any>>

export type BlockId = keyof typeof registry
