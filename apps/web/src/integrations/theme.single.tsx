// Imports no implementation, so single-theme builds ship no theme-switching code.
import type { ThemeModule, ThemeToggleProps } from '@/integrations/theme.types'

export function ThemeScript() {
  return null
}

export function ThemeToggle(_props: ThemeToggleProps) {
  return null
}

const _contract: ThemeModule = { ThemeScript, ThemeToggle }
void _contract
