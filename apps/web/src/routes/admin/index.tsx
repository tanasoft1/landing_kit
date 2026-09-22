import { createFileRoute, redirect } from '@tanstack/react-router'

// /admin itself has nothing to show. Task 15 repoints this at /admin/leads once that route
// exists; until then the login screen is the only destination there is.
export const Route = createFileRoute('/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/login' })
  },
})
