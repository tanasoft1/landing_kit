import { type BlockId, registry } from '~/blocks/registry'
import { localePath } from '~/shell/pages/enumerate'
import type { ResolvedPage } from '~/shell/pages/resolve-request'
import type { JsonLdNode, PageConfig, SiteConfig } from '~/shell/types'

function organizationNode(site: SiteConfig): JsonLdNode {
  const { organization: org } = site
  const node: JsonLdNode = {
    '@type': org.kind,
    '@id': `${site.url}/#organization`,
    name: org.legalName ?? site.name,
    url: site.url,
    logo: `${site.url}${org.logo}`,
  }
  if (org.email) node.email = org.email
  if (org.phone) node.telephone = org.phone
  if (org.sameAs) node.sameAs = org.sameAs
  if (org.address) {
    node.address = {
      '@type': 'PostalAddress',
      addressCountry: org.address.country,
      addressLocality: org.address.city,
      addressRegion: org.address.region,
      streetAddress: org.address.street,
      postalCode: org.address.postalCode,
    }
  }
  return node
}

export function buildJsonLd(
  resolved: ResolvedPage<BlockId>,
  site: SiteConfig,
  pages: PageConfig<BlockId>[],
): JsonLdNode {
  const { locale, page } = resolved
  const url = `${site.url}${localePath(page.path, locale, site)}`
  const seo = page.seo[locale]

  const graph: JsonLdNode[] = [
    {
      '@type': 'WebSite',
      '@id': `${site.url}/#website`,
      url: site.url,
      name: site.name,
      inLanguage: locale,
      publisher: { '@id': `${site.url}/#organization` },
    },
    organizationNode(site),
    {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
      url,
      name: seo.title,
      description: seo.description,
      inLanguage: locale,
      isPartOf: { '@id': `${site.url}/#website` },
    },
  ]

  if (pages.length > 1) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: pages[0]?.seo[locale].title ?? site.name,
          item: `${site.url}${localePath('/', locale, site)}`,
        },
        ...(page.path === '/'
          ? []
          : [{ '@type': 'ListItem', position: 2, name: seo.title, item: url }]),
      ],
    })
  }

  for (const ref of page.blocks) {
    const id = typeof ref === 'string' ? ref : ref.id
    const manifest = registry[id]
    if (!manifest.schema) continue
    graph.push(...manifest.schema({ copy: manifest.copy[locale], site, page }))
  }

  return { '@context': 'https://schema.org', '@graph': graph }
}
