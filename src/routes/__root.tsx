import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouterState,
} from '@tanstack/react-router'
import { site } from '~/config/site.config'
import { themeScript } from '~/shell/theme/theme-script'
import '~/styles/theme.css'

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
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <HeadContent />
        {site.theme.mode === 'both' ? (
          <script
            // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted, build-generated inline script; must run before first paint to avoid a flash of the wrong theme.
            dangerouslySetInnerHTML={{ __html: themeScript(site.theme.default ?? 'light') }}
          />
        ) : null}
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
