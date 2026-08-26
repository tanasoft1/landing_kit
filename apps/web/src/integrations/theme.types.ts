import type { ReactNode } from 'react'

export type ThemeToggleProps = { label: string }

/** Every `@/theme` variant must satisfy this exact surface. */
export type ThemeModule = {
  ThemeScript: () => ReactNode
  ThemeToggle: (props: ThemeToggleProps) => ReactNode
}
