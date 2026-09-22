import { createFileRoute, redirect } from '@tanstack/react-router'
import { PanelSkeleton } from '@/admin/components/panel-skeleton'

export const Route = createFileRoute('/admin/')({
  // Client-only, the same shape as `_authed` and for the same reason. Server-rendered,
  // `beforeLoad` returned here for want of a browser, the match dehydrated as `success`, and a
  // successful match is not re-run on the client. So /admin painted the skeleton and then sat on
  // it: `beforeLoad` had already had its one run, on the wrong side. Under `ssr: false` the match
  // is emitted `pending` instead, and pending is what makes the client run the hook itself, with
  // a browser, and redirect.
  ssr: false,
  // Measured rather than assumed, because the two candidate fixes here differ on exactly this
  // point: an `ssr: false` route DOES render its `pendingComponent` into the server output.
  // `curl http://localhost:5175/admin` answers 200 with both skeleton divs in the <body>.
  //
  // That is worth more here than on an inner route. The Go binary answers every /admin URL from
  // this one page's output once it is prerendered (internal/static/static.go), so an empty body
  // here would be an empty body for the whole panel on every hard load.
  pendingComponent: PanelSkeleton,
  beforeLoad: () => {
    // No `typeof window` guard and no `component`, and both absences follow from `ssr: false`.
    // The hook now runs only where there is a browser, so a guard against not having one could
    // never fire; and it always throws, so a component could never render.
    throw redirect({ to: '/admin/leads' })
  },
})
