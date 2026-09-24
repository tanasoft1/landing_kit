import type { BlockId } from '@/blocks/registry'
import { registry } from '@/blocks/registry'
import { getVariants } from '@/blocks/variant-registry'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { site } from '@/config/site.config'

// Stub on purpose. The real resolve() throws for targets not on the current page.
const resolve = (t: string) => `#${t}`

// Do not wrap a preview in another <Section> or <Container>. Blocks render their own.
export function BlockGallery() {
  const ids = Object.keys(registry) as BlockId[]
  return (
    <>
      {ids.map((id) => {
        const manifest = registry[id]
        const variantNames = manifest.variantNames as readonly string[]
        const variants = getVariants(id)
        return (
          <div key={id}>
            <Section density="compact">
              <Container>
                {/* h2, not h3: previews render at headingLevel 2. */}
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
                    // Backstop in case a variants.ts drops its `satisfies` check.
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
