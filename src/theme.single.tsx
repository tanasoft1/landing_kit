// Identical surface, nothing rendered, nothing imported. Because this variant imports no
// implementation, a single-mode build contains no theme-switching code at all rather than
// merely rendering none of it.
export function ThemeScript(_props: { defaultMode: 'light' | 'dark' }) {
  return null
}

export function ThemeToggle(_props: { label: string }) {
  return null
}
