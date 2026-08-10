import type { BlockId } from '~/blocks/registry'
import { registry } from '~/blocks/registry'
import { getVariants } from '~/blocks/variant-registry'
import { site } from '~/config/site.config'

// A stub, deliberately: this page is a gallery, not a real page, and nothing in it should
// navigate. A real `resolve()` throws for any target not present on the current page — every
// variant rendered here is out of context by definition, so the real thing would throw on most
// of them.
const resolve = (t: string) => `#${t}`

export function BlockGallery() {
  const ids = Object.keys(registry) as BlockId[]
  return (
    <div className="grid gap-16">
      {ids.map((id) => {
        const manifest = registry[id]
        const variantNames = manifest.variantNames as readonly string[]
        // Populated before hydration on the client (see src/client.tsx's special-case for
        // `/docs`) and synchronously on the server (src/blocks/variants.all.ts, loaded by
        // src/server.ts). Reading through the registry — not importing each block's
        // `variants.ts` here — is what keeps a new block or variant showing up with no edit
        // to this file.
        const variants = getVariants(id)
        return (
          <div key={id}>
            <h3 className="text-h3 font-semibold">
              {id}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                {variantNames.length} variant{variantNames.length === 1 ? '' : 's'} · default:{' '}
                {manifest.defaultVariant}
              </span>
            </h3>
            <div className="mt-4 grid gap-8">
              {variantNames.map((v) => {
                const Component = variants[v]
                if (!Component) return null
                return (
                  <div key={v} className="border-border overflow-hidden rounded-base border">
                    <div className="border-border bg-muted border-b px-4 py-2">
                      <code className="text-xs">{`{ id: '${id}', variant: '${v}' }`}</code>
                    </div>
                    <Component
                      copy={manifest.copy.en}
                      site={site}
                      resolve={resolve}
                      surface="default"
                      anchorId={`docs-${id}-${v}`}
                      headingLevel={2}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
