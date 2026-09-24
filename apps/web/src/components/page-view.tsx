import type { BlockId } from '@/blocks/registry'
import { Footer } from '@/components/footer'
import { Header } from '@/components/header'
import { RenderBlocks } from '@/components/render-blocks'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { createResolver } from '@/lib/pages/resolve-link'
import type { ResolvedPage } from '@/lib/pages/resolve-request'

export function PageView({ resolved }: { resolved: ResolvedPage<BlockId> }) {
  const resolve = createResolver(resolved, pages, site)

  // No <h1> here. The first block renders it.
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
