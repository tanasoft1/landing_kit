import type { BlockId } from '@/blocks/registry'
import { registry } from '@/blocks/registry'
import { getVariants } from '@/blocks/variant-registry'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { site } from '@/config/site.config'

// A stub, deliberately: nothing here should navigate. The real `resolve()` throws for any
// target not on the current page, and every variant here is out of context by definition.
const resolve = (t: string) => `#${t}`

/**
 * No extra `<Section>`/`<Container>` wrapper here: every block already renders its own, and
 * wrapping again doubled the padding/gutters, showing blocks at geometry no real page produces.
 */
export function BlockGallery() {
  const ids = Object.keys(registry) as BlockId[]
  return (
    <>
      {ids.map((id) => {
        const manifest = registry[id]
        const variantNames = manifest.variantNames as readonly string[]
        // Reading through the registry, not importing each block's `variants.ts` directly, is
        // what keeps a new block or variant showing up with no edit to this file.
        const variants = getVariants(id)
        return (
          <div key={id}>
            <Section density="compact">
              <Container>
                {/*
                  `h2`, not `h3`: every preview below renders at `headingLevel={2}`, so an `h3`
                  label would sit subordinate to the content it labels. Styling stays `text-h3` —
                  this is a semantic level, not a size. Literal `<h2>` is fine here:
                  check-conventions.mjs bans it only in `src/blocks`, where headingLevel is assigned.
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
                    // Unreachable while each block's `variants.ts` keeps its
                    // `satisfies Record<…Variant, …>` constraint. Backstop if that's ever lost —
                    // loud on purpose, per variant-registry.ts's "fail loudly, don't render empty".
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
