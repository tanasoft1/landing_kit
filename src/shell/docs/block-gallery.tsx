import type { BlockId } from '~/blocks/registry'
import { registry } from '~/blocks/registry'
import { getVariants } from '~/blocks/variant-registry'
import { site } from '~/config/site.config'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'

// A stub, deliberately: this page is a gallery, not a real page, and nothing in it should
// navigate. A real `resolve()` throws for any target not present on the current page — every
// variant rendered here is out of context by definition, so the real thing would throw on most
// of them.
const resolve = (t: string) => `#${t}`

/**
 * The gallery deliberately does NOT wrap previews in its own `<Section>`/`<Container>`.
 *
 * Every block renders its own `<Section>` (`py-section`) inside its own `<Container>`
 * (`px-gutter max-w-page`). Wrapping them again gave each preview doubled vertical padding and
 * two gutters of horizontal inset — so the gallery showed the blocks at geometry no real page
 * ever produces, which defeats the one thing a gallery is for. The label strip above each
 * preview gets its own `<Container>` instead, so it lines up with the block's content edge
 * without imposing anything on the block.
 */
export function BlockGallery() {
  const ids = Object.keys(registry) as BlockId[]
  return (
    <>
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
            <Section density="compact">
              <Container>
                {/*
                  `h2`, not `h3`. Each preview below this label renders the block's own heading at
                  `headingLevel={2}` — every preview must be 2, so the page keeps exactly one `h1`
                  — so an `h3` label sitting above `h2` content made the label subordinate to the
                  thing it labels. `h2` puts each block's section at the same level as the page's
                  own `Tokens`/`Blocks`/`Config` sections, which is what it is.

                  Styling is unchanged (`text-h3`): this is a semantic level, not a size. The
                  literal `<h2>` is fine here because `check-conventions.mjs` bans literal
                  `<h1>`/`<h2>` only in `src/blocks`, where the renderer assigns heading level. A
                  gallery is not a block and knows exactly what it is.
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
                    // Unreachable while `src/blocks/*/variants.ts` keeps its
                    // `satisfies Record<…Variant, …>` constraint — a declared variant with no
                    // component is a compile error there. If that constraint is ever lost, this
                    // is the backstop, and it is loud on purpose: rendering nothing on the one
                    // page whose entire job is "every variant appears" inverts the kit's own
                    // stated principle (src/blocks/variant-registry.ts: "Failing loudly beats
                    // rendering an empty section").
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
