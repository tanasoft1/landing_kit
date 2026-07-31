import type { BlockManifest } from '~/shell/types'
import { hero } from './hero/manifest'

export const registry = {
  hero,
} satisfies Record<string, BlockManifest<any, any>>

export type BlockId = keyof typeof registry
