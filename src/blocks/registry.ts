import type { BlockManifest } from '~/shell/types'
import { contact } from './contact/manifest'
import { hero } from './hero/manifest'

// `BlockManifest<any, any>` here is not "no type checking" — each manifest is precisely
// typed at its own definition site (e.g. `satisfies BlockManifest<HeroCopy, 'centered' | 'split'>`
// in ./hero/manifest.ts). This line only needs to prove every entry *is* a manifest; using
// `unknown` instead would collapse `keyof C` and break the `nav.labelKey` constraint.
export const registry = {
  hero,
  contact,
  // `variants` is a property (not a method), so TS checks its function type contravariantly:
  // a manifest's `(props: BlockProps<HeroCopy>) => ReactNode` would not be assignable to the
  // `(props: BlockProps<unknown>) => ReactNode` that `BlockManifest<unknown, unknown>` demands,
  // so every concrete manifest would fail this `satisfies` check.
  // biome-ignore lint/suspicious/noExplicitAny: unknown breaks assignability here (see above); any stays bivariant.
} satisfies Record<string, BlockManifest<any, any>>

export type BlockId = keyof typeof registry
