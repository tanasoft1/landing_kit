import { Skeleton } from '@/admin/ui/skeleton'

// The panel's server output, shown before the auth guard runs. Don't turn it into AdminShell:
// a visitor who is not signed in would see the sidebar flash before the login redirect.
export function PanelSkeleton() {
  return (
    <div className="bg-background min-h-screen p-6">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="mt-4 h-64 w-full" />
    </div>
  )
}
