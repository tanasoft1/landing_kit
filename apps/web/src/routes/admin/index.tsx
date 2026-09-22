import { createFileRoute, redirect } from '@tanstack/react-router'
import { Skeleton } from '@/admin/ui/skeleton'

export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    // This runs where there is no browser, and so where there is no session: the dev server
    // rendering a request, and the build prerendering a page. Redirecting from there picks the
    // destination without knowing whether anyone is signed in, and the answer is then either
    // frozen into a file or already followed by the browser. Only the client knows, so only the
    // client redirects.
    if (typeof window === 'undefined') return
    throw redirect({ to: '/admin/leads' })
  },
  component: AdminIndexSkeleton,
})

// What a hard load of /admin paints before hydration decides where it is really going.
function AdminIndexSkeleton() {
  return (
    <div className="bg-background min-h-screen p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-64 w-full" />
    </div>
  )
}
