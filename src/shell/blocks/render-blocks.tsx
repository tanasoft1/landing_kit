import { type BlockId, registry } from '~/blocks/registry'
import type { BlockRef, Locale, SiteConfig, Surface } from '~/shell/types'

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
  return (
    <>
      {blocks.map((ref, index) => {
        const { id, variant, surface } = normalize(ref)
        const manifest = registry[id]
        const Component =
          manifest.variants[(variant ?? manifest.defaultVariant) as keyof typeof manifest.variants]
        if (!Component) {
          throw new Error(
            `Block '${id}' has no variant '${variant}'. Available: ${Object.keys(manifest.variants).join(', ')}`,
          )
        }
        const copy = manifest.copy[locale]
        const resolvedSurface = surface ?? ALTERNATION[index % ALTERNATION.length] ?? 'default'
        return (
          <Component
            // biome-ignore lint/suspicious/noArrayIndexKey: page.blocks is static config and the same block id can repeat, so index is required for uniqueness
            key={`${id}-${index}`}
            copy={copy}
            site={site}
            resolve={resolve}
            surface={resolvedSurface}
          />
        )
      })}
    </>
  )
}
