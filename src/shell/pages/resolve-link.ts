import { registry } from '@/blocks/registry'
import type { PageConfig, SiteConfig } from '@/shell/types'
import { localePath } from './enumerate'
import type { ResolvedPage } from './resolve-request'

export function createResolver<Id extends string>(
  resolved: ResolvedPage<Id>,
  pages: PageConfig<Id>[],
  site: SiteConfig,
): (target: string) => string {
  const { locale, page } = resolved

  const blockIdsOn = (p: PageConfig<Id>): string[] =>
    p.blocks.map((b) => (typeof b === 'string' ? b : b.id))

  return (target: string): string => {
    const targetPage = pages.find((p) => p.id === target)
    if (targetPage) return localePath(targetPage.path, locale, site)

    if (blockIdsOn(page).includes(target)) return `#${target}`

    const owner = pages.find((p) => blockIdsOn(p).includes(target))
    if (owner) return `${localePath(owner.path, locale, site)}#${target}`

    if (target in registry) {
      throw new Error(`Link target '${target}' is a known block but is not placed on any page.`)
    }
    throw new Error(`Link target '${target}' matches no page id and no block id.`)
  }
}
