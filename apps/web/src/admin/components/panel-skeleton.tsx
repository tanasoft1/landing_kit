import { Skeleton } from '@/admin/ui/skeleton'

/**
 * What the panel paints before it has a browser: the server output of both `ssr: false` routes,
 * `/admin/` and `/admin/_authed`.
 *
 * Deliberately NOT `AdminShell`, and please do not "improve" it into the shell later. Both routes
 * reach this frame before anyone is known to be signed in. `_authed`'s guard has not run yet, so
 * a visitor with no session sees this frame first and only then gets sent to the login screen.
 * The sidebar, the email slot and the sign-out button are chrome for someone who has signed in.
 * Flashing them at a stranger leaks nothing, because the session is empty and there is no data in
 * them to leak, but it reads as the panel letting them in and then changing its mind. A skeleton
 * says "loading" to everyone and is wrong for nobody.
 *
 * One component rather than one per route, so the two frames cannot drift apart. They are the
 * same moment in the same panel.
 */
export function PanelSkeleton() {
  return (
    <div className="bg-background min-h-screen p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-64 w-full" />
    </div>
  )
}
