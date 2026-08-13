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

  // No hidden page-title <h1> fallback here: `RenderBlocks` assigns `headingLevel={1}` to the
  // page's first block, so whichever block opens the page renders the page's single, real,
  // visible <h1> itself. A hidden fallback would either double up (first block already has one)
  // or paper over a real gap (a first block with no heading at all — see that block's own file).
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
