import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminShell } from '@/admin/components/admin-shell'
import { refreshSession } from '@/admin/lib/api'
import { getSession } from '@/admin/lib/session'

/**
 * Pathless (`_authed`), so `/admin/leads` keeps its URL while `/admin/login` stays a sibling
 * rather than a child. A guard on `admin.tsx` would also run for the login route, redirect an
 * unauthenticated visitor to it, and loop.
 *
 * This is a convenience, not the security boundary. Every /api/admin/* route is behind the Go
 * service's AuthMiddleware, and that is what actually refuses data. All this decides is which
 * screen to paint.
 */
export const Route = createFileRoute('/admin/_authed')({
  // Client-only, and load-bearing rather than a preference. Rendered where there is no browser,
  // this subtree has no session to check and no origin to resolve `/api` against: `beforeLoad`
  // would wave every visitor through for want of anything to ask, and the leads loader would
  // hand Node's fetch the relative URL `/api/admin/leads`. Node rejects a relative URL,
  // `apiFetch` turns that rejection into ApiError(0, 'network'), and a signed-in admin gets an
  // error page where the table should be. Measured: without this line the dev server answered
  // `GET /admin/leads?page=1` with a 500 whose body was the shell wrapped around "0 network".
  // With it, the server emits a pending match for this route and no match at all for its child,
  // so `beforeLoad` and the loader below it each run once, on the client, where the session and
  // the origin both exist.
  ssr: false,
  beforeLoad: async () => {
    if (getSession().accessToken !== null) return
    // A reload starts with an empty session by design, so this is the ordinary path, not the
    // exceptional one: the refresh cookie is the only thing that survived, and one round trip
    // turns it back into an access token.
    if (await refreshSession()) return

    // No `next` parameter. Carrying a redirect target through the login screen is an
    // open-redirect waiting to be built wrong, and the panel has one destination worth landing
    // on anyway.
    throw redirect({ to: '/admin/login' })
  },
  component: AuthedLayout,
})

function AuthedLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  )
}
