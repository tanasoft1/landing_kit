import { createFileRoute, notFound } from '@tanstack/react-router'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { PageView } from '@/shell/pages/page-view'
import { resolveRequest } from '@/shell/pages/resolve-request'
import { buildHead } from '@/shell/seo/build-head'

export const Route = createFileRoute('/')({
  loader: () => {
    const resolved = resolveRequest('/', pages, site)
    if (!resolved) throw notFound()
    return resolved
  },
  head: ({ loaderData }) => (loaderData ? buildHead(loaderData, site, pages) : {}),
  component: HomeRoute,
})

function HomeRoute() {
  return <PageView resolved={Route.useLoaderData()} />
}
