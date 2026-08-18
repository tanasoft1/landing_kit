import type { BlockId } from '@/blocks/registry'
import { registry } from '@/blocks/registry'
import { getVariants } from '@/blocks/variant-registry'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { site } from '@/config/site.config'

// A stub on purpose: nothing on this page should navigate. The real `resolve()` throws for any
// target that is not on the current page, and every preview here is out of context by design.
const resolve = (t: string) => `#${t}`

/**
 * Do not wrap a preview in another `<Section>` or `<Container>`. Every block already renders
 * its own, and wrapping again doubles the padding and gutters, showing the block at a size no
 * real page produces. The label strip above each preview gets its own `<Container>`, so it
 * lines up with the block's content edge without changing the block itself.
 */
export function BlockGallery() {
  const ids = Object.keys(registry) as BlockId[]
  return (
    <>
      {ids.map((id) => {
        const manifest = registry[id]
        const variantNames = manifest.variantNames as readonly string[]
        // Read through the registry instead of importing each block's `variants.ts`. That is
        // what makes a new block or variant show up here with no edit to this file.
        const variants = getVariants(id)
        return (
          <div key={id}>
            <Section density="compact">
              <Container>
                {/*
                  `h2`, not `h3`: every preview below renders at `headingLevel={2}`, so an `h3`
                  label would sit subordinate to the content it labels. Styling stays `text-h3` —
                  this is a semantic level, not a size. Literal `<h2>` is fine here:
                  check-conventions.mjs bans it only in `src/blocks`, where headingLevel is
                  assigned.
                */}
                <h2 className="text-h3 font-semibold">
                  {id}{' '}
                  <span className="text-muted-foreground text-sm font-normal">
                    {variantNames.length} variant{variantNames.length === 1 ? '' : 's'} · default:{' '}
                    {manifest.defaultVariant}
                  </span>
                </h2>
              </Container>
            </Section>
            {variantNames.map((v) => {
              const Component = variants[v]
              return (
                <div key={v} className="border-border border-t">
                  <div className="border-border bg-muted border-b py-2">
                    <Container>
                      <code className="text-xs">{`{ id: '${id}', variant: '${v}' }`}</code>
                    </Container>
                  </div>
                  {Component ? (
                    <Component
                      copy={manifest.copy.en}
                      site={site}
                      resolve={resolve}
                      surface="default"
                      anchorId={`docs-${id}-${v}`}
                      headingLevel={2}
                    />
                  ) : (
                    // Unreachable while every block's `variants.ts` keeps its
                    // `satisfies Record<…Variant, …>`. A backstop if that is ever dropped, and
                    // loud on purpose — same rule as variant-registry.ts.
                    <Section density="compact" surface="accent">
                      <Container>
                        <p className="text-sm font-semibold">
                          Missing variant component: block <code>{id}</code> declares variant{' '}
                          <code>{v}</code> in its manifest, but <code>{id}/variants.ts</code>{' '}
                          exports no component under that key.
                        </p>
                      </Container>
                    </Section>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
