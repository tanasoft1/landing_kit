import { Link, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { LanguageToggle } from '@/admin/components/language-toggle'
import { useT } from '@/admin/i18n/use-t'
import { logout } from '@/admin/lib/api'
import { useSession } from '@/admin/lib/session'
import { Button } from '@/admin/ui/button'
import { Separator } from '@/admin/ui/separator'
import { Toaster } from '@/admin/ui/sonner'

export function AdminShell({ children }: { children: ReactNode }) {
  const t = useT()
  const { email } = useSession()
  const navigate = useNavigate()

  const signOut = async () => {
    await logout()
    await navigate({ to: '/admin/login' })
  }

  return (
    <div className="bg-background text-foreground min-h-screen md:grid md:grid-cols-[14rem_1fr]">
      <aside className="border-border bg-muted/40 border-b p-4 md:border-r md:border-b-0">
        <p className="text-sm font-semibold">{t.panelTitle}</p>
        <Separator className="my-3" />
        <nav className="grid gap-1">
          {/* <Link>, not <a href>. The panel is a real SPA and the rule banning client-side links
              elsewhere does not apply here -- see the exemption in scripts/check-conventions.mjs
              and the reasoning above it. */}
          <Link
            to="/admin/leads"
            className="rounded-base px-2 py-1.5 text-sm"
            // A nav entry points at a section, not at a page of it. TanStack compares search
            // params when it decides whether a link is active, and this link carries no `page`
            // while the route always resolves one, so on /admin/leads?page=2 the entry would stop
            // looking active for the screen it is currently showing.
            activeOptions={{ includeSearch: false }}
            activeProps={{
              className: 'bg-accent text-accent-foreground rounded-base px-2 py-1.5 text-sm',
            }}
          >
            {t.navLeads}
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-border flex items-center justify-end gap-2 border-b px-4 py-3">
          {/* Rendered from the session rather than from storage. It is empty for the one frame
              between mount and the first refresh completing, which is why it is not a heading. */}
          <span className="text-muted-foreground mr-auto truncate text-sm">{email}</span>
          <LanguageToggle />
          <Button variant="ghost" size="sm" onClick={signOut}>
            {t.signOut}
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>

      <Toaster />
    </div>
  )
}
