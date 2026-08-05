import { createFileRoute } from '@tanstack/react-router'
import { pages } from '~/config/pages.config'
import { site } from '~/config/site.config'
import { enumerateUrls } from '~/shell/pages/enumerate'

export const Route = createFileRoute('/debug')({
  component: () => (
    <pre className="p-6 text-xs">{JSON.stringify(enumerateUrls(pages, site), null, 2)}</pre>
  ),
})
