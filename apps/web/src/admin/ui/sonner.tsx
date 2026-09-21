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
 * read: `@/components/theme-script` puts a `dark` class on <html> before first paint and
 * `@/components/theme-toggle` flips it, so the class IS the state.
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
      // shadcn's own names for these (`--popover`, `--border`) are the variables its stylesheet
      // defines and this kit's presets do not, so each resolved to nothing and sonner fell back to
      // its built-in palette. Pointed at the preset tokens instead — the same ones `@theme inline`
      // aliases `--color-popover` and friends onto.
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
