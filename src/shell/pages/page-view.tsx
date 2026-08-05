import type { BlockId } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { RenderBlocks } from '~/shell/blocks/render-blocks'
import { Footer } from '~/shell/chrome/footer'
import { Header } from '~/shell/chrome/header'
import { createResolver } from '~/shell/pages/resolve-link'
import type { ResolvedPage } from '~/shell/pages/resolve-request'

function blockIdsOn(blocks: ResolvedPage<BlockId>['page']['blocks']): string[] {
  return blocks.map((b) => (typeof b === 'string' ? b : b.id))
}

export function PageView({ resolved }: { resolved: ResolvedPage<BlockId> }) {
  const resolve = createResolver(resolved, pages, site)

  // Every page needs exactly one <h1> (verify-build enforces this), and `hero` is the only
  // block permitted to render one (check-conventions enforces that half). A page that doesn't
  // place `hero` — e.g. a standalone `/contact` — would otherwise ship with zero, so the shell
  // supplies a visually-hidden one from the page's own SEO title. This never doubles up: a page
  // that does place `hero` skips it, since hero's own (visible) <h1> already satisfies the rule.
  const hasHero = blockIdsOn(resolved.page.blocks).includes('hero')

  return (
    <>
      <Header site={site} locale={resolved.locale} path={resolved.path} resolve={resolve} />
      <main>
        {hasHero ? null : <h1 className="sr-only">{resolved.page.seo[resolved.locale].title}</h1>}
        <RenderBlocks
          blocks={resolved.page.blocks}
          locale={resolved.locale}
          site={site}
          resolve={resolve}
        />
      </main>
      <Footer site={site} />
    </>
  )
}
