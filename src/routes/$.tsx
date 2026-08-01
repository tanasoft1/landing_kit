import { createFileRoute, notFound } from '@tanstack/react-router'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { PageView } from '~/shell/pages/page-view'
import { resolveRequest } from '~/shell/pages/resolve-request'

export const Route = createFileRoute('/$')({
  loader: ({ params }) => {
    const splat = (params as { _splat?: string })._splat ?? ''
    const resolved = resolveRequest(`/${splat}`, pages, site)
    if (!resolved) throw notFound()
    return resolved
  },
  component: SplatRoute,
})

function SplatRoute() {
  return <PageView resolved={Route.useLoaderData()} />
}
