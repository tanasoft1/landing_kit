import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageView } from '@/components/page-view'
import { pages } from '@/config/pages.config'
import { site } from '@/config/site.config'
import { resolveRequest } from '@/lib/pages/resolve-request'
import { buildHead } from '@/lib/seo/build-head'

export const Route = createFileRoute('/$')({
  loader: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? ''
    const resolved = resolveRequest(`/${splat}`, pages, site)
    if (!resolved) throw notFound()
    return resolved
  },
  head: ({ loaderData }) => (loaderData ? buildHead(loaderData, site, pages) : {}),
  component: SplatRoute,
})

function SplatRoute() {
  return <PageView resolved={Route.useLoaderData()} />
}
