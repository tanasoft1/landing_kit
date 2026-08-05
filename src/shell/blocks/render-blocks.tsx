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
  const seen = new Map<string, number>()

  return (
    <>
      {blocks.map((ref, index) => {
        const { id, variant, surface } = normalize(ref)

        // `registry` is typed `Record<BlockId, BlockManifest<any, any>>` at its export (see
        // registry.ts), so `registry[id]` already resolves to `BlockManifest<any, any>` here —
        // no per-call-site widening needed.
        const manifest = registry[id]
        if (!manifest) {
          throw new Error(
            `Unknown block id '${id}'. Available: ${Object.keys(registry).join(', ')}`,
          )
        }

        const variantName = variant ?? manifest.defaultVariant
        // The cast is paired with the throw below — do not remove one without the other.
        const Component = manifest.variants[variantName as keyof typeof manifest.variants]
        if (!Component) {
          throw new Error(
            `Block '${id}' has no variant '${variantName}'. Available: ${Object.keys(manifest.variants).join(', ')}`,
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
            // The trailing 'default' satisfies noUncheckedIndexedAccess; a modulo
            // index into ALTERNATION can never actually miss.
            surface={surface ?? ALTERNATION[index % ALTERNATION.length] ?? 'default'}
            anchorId={anchorId}
          />
        )
      })}
    </>
  )
}
