import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { AdminShell } from '@/admin/components/admin-shell'
import { PanelSkeleton } from '@/admin/components/panel-skeleton'
import { useT } from '@/admin/i18n/use-t'
import { refreshSession } from '@/admin/lib/api'
import { ApiError } from '@/admin/lib/errors'
import { getSession } from '@/admin/lib/session'

// Pathless, so /admin/login is a sibling. A guard on admin.tsx would also guard login and loop.
// Not the security boundary: the API refuses data without a valid token.
export const Route = createFileRoute('/admin/_authed')({
  // Required. On the server there is no session and no origin for the relative `/api` URL,
  // so the guard and loaders must run in the browser.
  ssr: false,
  // Without it, the server sends an empty body and the page is white until JS loads.
  // Not AdminShell: this paints before the guard runs, so the visitor may not be signed in.
  pendingComponent: PanelSkeleton,
  beforeLoad: async () => {
    if (getSession().accessToken !== null) return
    // The normal path after a reload: the session lives in memory only.
    const outcome = await refreshSession()
    if (outcome === 'refreshed') return

    // The server failed, not the session. Show an error, not a password prompt.
    if (outcome === 'unavailable') throw new ApiError(503, 'unavailable', '')

    // No `next` parameter on purpose. It invites an open redirect.
    throw redirect({ to: '/admin/login' })
  },
  component: AuthedLayout,
  errorComponent: PanelError,
})

// Not in AdminShell: the guard may throw before anyone is known to be signed in.
// `error: unknown`, not Error. Some router versions type it as unknown, and Error fails there.
function PanelError({ error }: { error: unknown }) {
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
