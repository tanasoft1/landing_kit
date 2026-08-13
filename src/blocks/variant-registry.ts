import type { ComponentType } from 'react'
import type { BlockProps } from '@/shell/types'
import type { BlockId } from './registry'

// biome-ignore lint/suspicious/noExplicitAny: one map holds every block's differently-typed copy.
type VariantMap = Record<string, ComponentType<BlockProps<any>>>

const loaded = new Map<BlockId, VariantMap>()

export function registerVariants(id: BlockId, variants: VariantMap) {
  loaded.set(id, variants)
}

export function getVariants(id: BlockId): VariantMap {
  const v = loaded.get(id)
  if (!v) {
    // Reaching here means a block rendered before its module was loaded — a wiring bug, not a
    // user-facing condition. Failing loudly beats rendering an empty section.
    throw new Error(
      `Variants for block '${id}' were never registered. The entry point must load and register a block's module before rendering it.`,
    )
  }
  return v
}
