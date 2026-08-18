import { createFileRoute } from '@tanstack/react-router'
import { BlockGallery } from '@/components/docs/block-gallery'
import { ConfigReference } from '@/components/docs/config-reference'
import { TokenGallery } from '@/components/docs/token-gallery'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'

// Left out of pages.config.ts on purpose. That keeps it out of the sitemap (`enumerateUrls`),
// and — with `autoStaticPathsDiscovery` and `crawlLinks` both false in vite.config.ts — out of
// prerendering. The `noindex, nofollow` meta below is the third layer.
//
// robots.txt has no `Disallow: /docs`, also on purpose. `Disallow` and `noindex` cancel each
// other out: a crawler that obeys `Disallow` never fetches the page, so it never sees the
// `noindex`, and an external link can still get it indexed by URL alone. `/docs` has to stay
// fetchable for the `noindex` to be read. `verify-build.mjs` fails the build if
// `Disallow: /docs` comes back, and `check-conventions.mjs` fails if this meta tag is removed.
export const Route = createFileRoute('/docs')({
  // `<html lang>` comes from `useActiveLocale` in `__root.tsx`, which falls back to
  // `site.defaultLocale` when no route declares one. Without this loader `/docs` fell back to
  // `mn` and shipped `<html lang="mn">` on an English-only page, which makes a screen reader
  // mispronounce it. Handled with a loader here rather than a special case in `__root.tsx`,
  // which is meant to know nothing about any particular route.
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
    // `density="compact"` everywhere here. `py-section` leaves about 300px between sections,
    // which suits a marketing page but slows down scanning a reference page.
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
      {/* Outside any Section/Container on purpose: every block brings its own. See BlockGallery. */}
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
