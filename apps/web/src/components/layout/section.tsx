import type { ReactNode } from 'react'
import type { Surface } from '@/lib/types'

const SURFACE_CLASS: Record<Surface, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted text-foreground',
  accent: 'bg-accent text-foreground',
}

// `compact` is for reference pages like /docs. Both follow the preset's --section-y.
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
