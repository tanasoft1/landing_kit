import type { ReactNode } from 'react'

export type ThemeScriptProps = { defaultMode: 'light' | 'dark' }
export type ThemeToggleProps = { label: string }

/** Every `@/theme` variant must satisfy this exact surface. */
export type ThemeModule = {
  ThemeScript: (props: ThemeScriptProps) => ReactNode
  ThemeToggle: (props: ThemeToggleProps) => ReactNode
}
