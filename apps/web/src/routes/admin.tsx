import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { loadStoredLanguage } from '@/admin/lib/language'

// Keep the noindex meta. robots.txt does not Disallow /admin, so crawlers can read it.
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [{ title: 'Admin' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AdminRoot,
})

function AdminRoot() {
  // After mount, so hydration matches the server HTML.
  useEffect(() => {
    loadStoredLanguage()
  }, [])

  return <Outlet />
}
