import { createRootRoute, HeadContent, Outlet, Scripts } from '@tanstack/react-router'
import '~/styles/theme.css'

export const Route = createRootRoute({
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="mn">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
