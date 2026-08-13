// Identical surface, nothing rendered, nothing imported. Because this variant imports no
// implementation, a single-mode build contains no theme-switching code at all rather than
// merely rendering none of it.
import type { ThemeModule, ThemeScriptProps, ThemeToggleProps } from '@/theme.types'

export function ThemeScript(_props: ThemeScriptProps) {
  return null
}

export function ThemeToggle(_props: ThemeToggleProps) {
  return null
}

const _contract: ThemeModule = { ThemeScript, ThemeToggle }
void _contract
