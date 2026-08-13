import type { ReactNode } from 'react'
import type { Surface } from '@/shell/types'

const SURFACE_CLASS: Record<Surface, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted text-foreground',
  accent: 'bg-accent text-foreground',
}

// One optional knob, not a layout system. `py-section` is tuned for marketing pages — up to
// 9.5rem top AND bottom, ~300px between sections — which is most of the look and must not move.
// `compact` exists for reference surfaces (`/docs`) that are scanned rather than read down, where
// that much air actively slows the reader. Both values come from the preset's `--section-y`
// (see theme.css), so a reskin still moves them together.
const DENSITY_CLASS = {
  default: 'py-section',
  compact: 'py-section-tight',
} as const

export function Section({
  id,
  surface = 'default',
  density = 'default',
  className = '',
  children,
}: {
  id?: string
  surface?: Surface
  /** `'default'` is the pre-existing spacing, unchanged, so no existing page moves. */
  density?: keyof typeof DENSITY_CLASS
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={`${DENSITY_CLASS[density]} ${SURFACE_CLASS[surface]} ${className}`}>
      {children}
    </section>
  )
}
