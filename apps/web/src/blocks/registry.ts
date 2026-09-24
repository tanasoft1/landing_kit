import type { BlockManifest } from '@/lib/types'
import { contact } from './contact/block'
import { cta } from './cta/block'
import { features } from './features/block'
import { hero } from './hero/block'

const manifests = {
  hero,
  contact,
  features,
  cta,
  // biome-ignore lint/suspicious/noExplicitAny: unknown breaks assignability here.
} satisfies Record<string, BlockManifest<any, any>>

export type BlockId = keyof typeof manifests

// A literal, not `= manifests`: verify-build.mjs scans the source text for this declaration.
// biome-ignore lint/suspicious/noExplicitAny: same reason as above.
export const registry: Record<BlockId, BlockManifest<any, any>> = {
  hero,
  contact,
  features,
  cta,
}
