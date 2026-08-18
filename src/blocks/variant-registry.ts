import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
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
    // Getting here means a block rendered before its module loaded. That is a wiring bug, not
    // something a visitor can cause, so fail loudly instead of rendering an empty section.
    throw new Error(
      `Variants for block '${id}' were never registered. The entry point must load and register a block's module before rendering it.`,
    )
  }
  return v
}
