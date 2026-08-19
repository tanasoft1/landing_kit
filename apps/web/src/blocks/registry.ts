import type { BlockManifest } from '@/lib/types'
import { contact } from './contact/block'
import { cta } from './cta/block'
import { features } from './features/block'
import { hero } from './hero/block'

// Only checks that each entry IS a manifest; each one is already fully typed where it is
// defined. This exists so `BlockId` below can be derived from the real keys.
const manifests = {
  hero,
  contact,
  features,
  cta,
  // `schema` is a property, so TS checks its type contravariantly: `unknown` would make every
  // concrete manifest fail this `satisfies` check.
  // biome-ignore lint/suspicious/noExplicitAny: unknown breaks assignability here.
} satisfies Record<string, BlockManifest<any, any>>

// Derived from the object keys, not hand-written, so it can't drift from the registry.
export type BlockId = keyof typeof manifests

// A literal, not `= manifests`: verify-build.mjs scans the source text for this declaration.
// The explicit `Record<BlockId, ...>` widens the `any` once, here, instead of at every call
// site that indexes the registry (render-blocks.tsx, json-ld.ts).
// biome-ignore lint/suspicious/noExplicitAny: same reason as above.
export const registry: Record<BlockId, BlockManifest<any, any>> = {
  hero,
  contact,
  features,
  cta,
}
