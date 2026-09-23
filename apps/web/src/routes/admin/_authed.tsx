import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminShell } from '@/admin/components/admin-shell'
import { PanelSkeleton } from '@/admin/components/panel-skeleton'
import { useT } from '@/admin/i18n/use-t'
import { refreshSession } from '@/admin/lib/api'
import { ApiError } from '@/admin/lib/errors'
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
  // Without this the server emitted a body of `<!--$--><!--$--><!--/$-->` and nothing else, so
  // `pnpm dev` and /admin/leads was a white page until the bundle booted. That reads as broken
  // software on the first run of a freshly scaffolded project, which is the one impression this
  // kit exists to get right.
  //
  // `PanelSkeleton`, not `AdminShell`. This frame is painted BEFORE the guard below has run, so
  // whoever is looking at it may have no session and may be about to be sent to the login screen.
  // The reasoning for keeping the shell out of it is on the component.
  pendingComponent: PanelSkeleton,
  beforeLoad: async () => {
    if (getSession().accessToken !== null) return
    // A reload starts with an empty session by design, so this is the ordinary path, not the
    // exceptional one: the refresh cookie is the only thing that survived, and one round trip
    // turns it back into an access token.
    const outcome = await refreshSession()
    if (outcome === 'refreshed') return

    // A refresh the API could not answer is not a session ending, so it does not get the login
    // screen. The cookie is untouched and very probably still good; what failed is the server, or
    // something in front of it. Throwing sends this to the boundary below, which says so. A
    // password prompt here would tell an admin their session expired when it did not, and teach
    // them to retype the admin password whenever the panel misbehaves — the one habit worth not
    // teaching the person who holds the only credential.
    if (outcome === 'unavailable') throw new ApiError(503, 'unavailable', '')

    // No `next` parameter. Carrying a redirect target through the login screen is an
    // open-redirect waiting to be built wrong, and the panel has one destination worth landing
    // on anyway.
    throw redirect({ to: '/admin/login' })
  },
  component: AuthedLayout,
  errorComponent: PanelError,
})

/**
 * What the panel shows when the guard above, or anything below it, throws.
 *
 * Without one, the router's built-in component renders `error.message` — "503 unavailable" — over
 * a stack trace toggle, which tells an operator nothing they can act on. This renders the panel's
 * own translated string instead, in whichever language they have set.
 *
 * Not wrapped in `AdminShell`, for the same reason `PanelSkeleton` is not: the guard may have
 * thrown before anyone was known to be signed in, and the shell's nav and sign-out button are
 * chrome for someone who is.
 */
function PanelError({ error }: { error: Error }) {
  const t = useT()
  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <p className="text-muted-foreground max-w-sm text-center text-sm">
        {error instanceof ApiError ? error.messageFor(t) : t.errUnknown}
      </p>
    </main>
  )
}

function AuthedLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  )
}
