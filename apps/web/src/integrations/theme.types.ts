import type { ReactNode } from 'react'

export type ThemeToggleProps = { label: string }

/** What `@/theme` must export. */
export type ThemeModule = {
  ThemeScript: () => ReactNode
  ThemeToggle: (props: ThemeToggleProps) => ReactNode
}
