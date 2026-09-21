import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import * as React from 'react'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

/**
 * The current theme, read from the kit's own mechanism.
 *
 * shadcn ships this component reading `useTheme()` from next-themes. This kit has no provider to
 * read: the class on <html> IS the state. In a project with both themes
 * `@/components/theme-script` sets it before first paint and `@/components/theme-toggle` flips it;
 * in a light-only or dark-only project both of those render null and the class comes from
 * `src/routes/__root.tsx` instead. Reading the class rather than the mechanism is what makes this
 * hook correct in all three.
 *
 * `useState` then `useEffect`, the same shape the toggle uses, because there is no class during
 * prerender and reading one in render would hydrate to the wrong value. The observer is what keeps
 * an open toast in step when someone flips the toggle underneath it.
 */
function useKitTheme(): 'light' | 'dark' {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light')

  React.useEffect(() => {
    const root = document.documentElement
    const read = () => setTheme(root.classList.contains('dark') ? 'dark' : 'light')
    read()
    const observer = new MutationObserver(read)
    observer.observe(root, { attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return theme
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useKitTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      // shadcn's own names for these (`--popover`, `--border`) are variables its stylesheet defines
      // and this kit's presets do not. An inline `--normal-bg: var(--popover)` with `--popover`
      // undefined is guaranteed-invalid, which behaves as `unset` on a custom property, so
      // `background: var(--normal-bg)` on the toast would have been invalid at computed-value time
      // and painted transparent -- not fallen back to sonner's own palette, which it declares on
      // this same element and which the inline style overrides. Pointed at the preset tokens
      // instead, the same ones `@theme inline` aliases `--color-popover` and friends onto.
      style={
        {
          '--normal-bg': 'var(--c-background)',
          '--normal-text': 'var(--c-foreground)',
          '--normal-border': 'var(--c-border)',
          '--border-radius': 'var(--radius)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
