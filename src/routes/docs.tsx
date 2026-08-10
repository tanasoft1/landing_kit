import { createFileRoute } from '@tanstack/react-router'
import { BlockGallery } from '~/shell/docs/block-gallery'
import { ConfigReference } from '~/shell/docs/config-reference'
import { TokenGallery } from '~/shell/docs/token-gallery'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'

// Deliberately absent from pages.config.ts, which is what excludes it from prerendering (the
// `tanstackStart` plugin only prerenders `enumerateUrls(pages, site)`, and both
// `autoStaticPathsDiscovery` and `crawlLinks` are off in vite.config.ts) and from the sitemap
// (emit-plugin.ts builds it from the same `enumerateUrls` call). Three mechanisms in total, the
// third being the `noindex, nofollow` meta below.
//
// There is deliberately NO `Disallow: /docs` in robots.txt, and that omission is a decision, not
// an oversight. `Disallow` and `noindex` do not layer — they cancel: a crawler that obeys a
// `Disallow` never fetches the page, so it never reads the `noindex`, and a URL linked from
// anywhere else still gets indexed URL-only, which is precisely what the `noindex` is here to
// prevent. `/docs` must stay FETCHABLE so the `noindex` is actually seen; a crawler then drops
// the URL from the index authoritatively. Adding a `Disallow` here would defeat the one
// mechanism that works on an SSR deploy. `scripts/verify-build.mjs` fails the build if a
// `Disallow` for `/docs` reappears, and `scripts/check-conventions.mjs` fails if this meta tag
// is removed.
export const Route = createFileRoute('/docs')({
  head: () => ({
    meta: [
      { title: 'Landing Kit — developer docs' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: DocsPage,
})

function DocsPage() {
  return (
    <main>
      <Section>
        <Container>
          <h1 className="text-h2 font-semibold">Developer docs</h1>
          <p className="text-muted-foreground text-lead mt-3">
            Generated from the live registry and CSS, so it cannot drift from the code. English only
            — this page is for developers, not visitors, and it is excluded from prerendering, the
            sitemap and indexing.
          </p>
        </Container>
      </Section>

      <Section surface="muted">
        <Container>
          <h2 className="text-h2 font-semibold">Tokens</h2>
          <div className="mt-8">
            <TokenGallery />
          </div>
        </Container>
      </Section>

      <Section>
        <Container>
          <h2 className="text-h2 font-semibold">Blocks</h2>
          <div className="mt-8">
            <BlockGallery />
          </div>
        </Container>
      </Section>

      <Section surface="muted">
        <Container>
          <h2 className="text-h2 font-semibold">Config</h2>
          <div className="mt-8">
            <ConfigReference />
          </div>
        </Container>
      </Section>
    </main>
  )
}
