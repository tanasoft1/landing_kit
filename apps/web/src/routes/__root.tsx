import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import { site } from '@/config/site.config'
import { ThemeScript } from '@/theme'
import '@/styles/theme.css'

export const Route = createRootRoute({
  component: RootDocument,
})

function useActiveLocale(): string {
  const matches = useRouterState({ select: (s) => s.matches })
  for (let i = matches.length - 1; i >= 0; i--) {
    const data = matches[i]?.loaderData as { locale?: string } | undefined
    if (data?.locale) return data.locale
  }
  return site.defaultLocale
}

function RootDocument() {
  const lang = useActiveLocale()
  return (
    <html lang={lang} className={site.theme.mode === 'dark' ? 'dark' : undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
        <ThemeScript />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
