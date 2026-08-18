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

        // `registry` is typed `Record<BlockId, BlockManifest<any, any>>` at its export, so no
        // per-call-site widening is needed here.
        const manifest = registry[id]
        if (!manifest) {
          throw new Error(
            `Unknown block id '${id}'. Available: ${Object.keys(registry).join(', ')}`,
          )
        }

        const variantName = variant ?? manifest.defaultVariant
        // `getVariants` throws its own error when this block's module was never loaded. That is
        // a different problem from the one below, which is an unknown variant name on a block
        // that did load. Both are wiring bugs, not something a visitor can cause.
        const variants = getVariants(id)
        const Component = variants[variantName]
        if (!Component) {
          throw new Error(
            `Block '${id}' has no variant '${variantName}'. Available: ${Object.keys(variants).join(', ')}`,
          )
        }

        // De-duplicate anchor ids: first 'cta' is #cta, a second becomes #cta-2.
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
            // The trailing 'default' is only there to satisfy noUncheckedIndexedAccess. A
            // modulo index into ALTERNATION can never actually miss.
            surface={surface ?? ALTERNATION[index % ALTERNATION.length] ?? 'default'}
            anchorId={anchorId}
            // The first block on the page owns the page's single <h1>. Every later block gets
            // an <h2>. A block cannot know its own position, so this is set here, not by the
            // block — same reason as `surface` and `anchorId` above.
            headingLevel={index === 0 ? 1 : 2}
          />
        )
      })}
    </>
  )
}
