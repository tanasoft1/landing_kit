import { createFileRoute } from '@tanstack/react-router'
import { BlockGallery } from '@/components/docs/block-gallery'
import { ConfigReference } from '@/components/docs/config-reference'
import { TokenGallery } from '@/components/docs/token-gallery'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'

// Not in pages.config.ts, so it stays out of the sitemap and prerendering. Keep the noindex
// meta, and never add `Disallow: /docs` to robots.txt: crawlers must fetch it to see noindex.
export const Route = createFileRoute('/docs')({
  // Sets <html lang="en">. Without it the page gets the default locale.
  loader: () => ({ locale: 'en' as const }),
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
      <Section density="compact">
        <Container>
          <h1 className="text-h2 font-semibold">Developer docs</h1>
          <p className="text-muted-foreground text-lead mt-3">
            Generated from the live registry and CSS, so it cannot drift from the code. English only
            — this page is for developers, not visitors, and it is excluded from prerendering, the
            sitemap and indexing.
          </p>
        </Container>
      </Section>

      <Section surface="muted" density="compact">
        <Container>
          <h2 className="text-h2 font-semibold">Tokens</h2>
          <div className="mt-8">
            <TokenGallery />
          </div>
        </Container>
      </Section>

      <Section density="compact">
        <Container>
          <h2 className="text-h2 font-semibold">Blocks</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Each preview below renders at true page geometry — its own Section and Container, no
            extra wrapper — so it shows the block exactly as a real page would.
          </p>
        </Container>
      </Section>
      <BlockGallery />

      <Section surface="muted" density="compact">
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
