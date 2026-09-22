import { createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { loadStoredLanguage } from '@/admin/lib/language'
import '@/admin/admin.css'

// Left out of pages.config.ts on purpose, exactly like /docs: `enumerateUrls` never yields it, so
// it is absent from the sitemap and the nav.
//
// That absence is why the `noindex` below matters. /admin is still reachable on any deploy that
// serves this app, and robots.txt deliberately does not Disallow it, for the same reason it does
// not Disallow /docs: a crawler told not to fetch the page never reads the tag telling it not to
// index the page, and an external link can get a URL indexed on its own. So the page has to stay
// fetchable for this tag to do its job. check-conventions.mjs fails if the meta is removed.
export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [{ title: 'Admin' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: AdminRoot,
})

function AdminRoot() {
  // Applied after mount, never at module load. The panel's first HTML is produced where no
  // browser storage exists, so a language read from localStorage during the first render would
  // disagree with the HTML being hydrated and React would report a mismatch. See the comment on
  // `state` in @/admin/lib/language.
  useEffect(() => {
    loadStoredLanguage()
  }, [])

  return <Outlet />
}
