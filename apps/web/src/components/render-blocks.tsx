import { type BlockId, registry } from '@/blocks/registry'
import { getVariants } from '@/blocks/variant-registry'
import type { BlockRef, Locale, SiteConfig, Surface } from '@/lib/types'

const ALTERNATION: Surface[] = ['default', 'muted']

function normalize(ref: BlockRef<BlockId>): { id: BlockId; variant?: string; surface?: Surface } {
  return typeof ref === 'string' ? { id: ref } : ref
}

export function RenderBlocks({
  blocks,
  locale,
  site,
  resolve,
}: {
  blocks: BlockRef<BlockId>[]
  locale: Locale
  site: SiteConfig
  resolve: (target: string) => string
}) {
  const seen = new Map<string, number>()

  return (
    <>
      {blocks.map((ref, index) => {
        const { id, variant, surface } = normalize(ref)

        const manifest = registry[id]
        if (!manifest) {
          throw new Error(
            `Unknown block id '${id}'. Available: ${Object.keys(registry).join(', ')}`,
          )
        }

        const variantName = variant ?? manifest.defaultVariant
        const variants = getVariants(id)
        const Component = variants[variantName]
        if (!Component) {
          throw new Error(
            `Block '${id}' has no variant '${variantName}'. Available: ${Object.keys(variants).join(', ')}`,
          )
        }

        const occurrence = (seen.get(id) ?? 0) + 1
        seen.set(id, occurrence)
        const anchorId = occurrence === 1 ? id : `${id}-${occurrence}`

        return (
          <Component
            // biome-ignore lint/suspicious/noArrayIndexKey: page.blocks is static config and the same block id can repeat, so index is required for uniqueness
            key={`${id}-${variantName}-${index}`}
            copy={manifest.copy[locale]}
            site={site}
            resolve={resolve}
            surface={surface ?? ALTERNATION[index % ALTERNATION.length] ?? 'default'}
            anchorId={anchorId}
            headingLevel={index === 0 ? 1 : 2}
          />
        )
      })}
    </>
  )
}
