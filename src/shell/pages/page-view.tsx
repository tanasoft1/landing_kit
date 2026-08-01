import type { BlockId } from '~/blocks/registry'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { RenderBlocks } from '~/shell/blocks/render-blocks'
import { Footer } from '~/shell/chrome/footer'
import { Header } from '~/shell/chrome/header'
import { createResolver } from '~/shell/pages/resolve-link'
import type { ResolvedPage } from '~/shell/pages/resolve-request'

export function PageView({ resolved }: { resolved: ResolvedPage<BlockId> }) {
  const resolve = createResolver(resolved, pages, site)
  return (
    <>
      <Header site={site} locale={resolved.locale} path={resolved.path} resolve={resolve} />
      <main>
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
