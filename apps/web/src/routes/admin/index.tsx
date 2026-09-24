import { createFileRoute, redirect } from '@tanstack/react-router'
import { PanelSkeleton } from '@/admin/components/panel-skeleton'

export const Route = createFileRoute('/admin/')({
  // Required. Rendered on the server, the redirect never runs in the browser and the page hangs
  // on the skeleton.
  ssr: false,
  // The server serves every /admin URL from this page's HTML, so this skeleton is what every
  // panel page shows before JS loads.
  pendingComponent: PanelSkeleton,
  beforeLoad: () => {
    throw redirect({ to: '/admin/leads' })
  },
})
