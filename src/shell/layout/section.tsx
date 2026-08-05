import type { ReactNode } from 'react'
import type { Surface } from '~/shell/types'

const SURFACE_CLASS: Record<Surface, string> = {
  default: 'bg-background text-foreground',
  muted: 'bg-muted text-foreground',
  accent: 'bg-accent text-foreground',
}

export function Section({
  id,
  surface = 'default',
  className = '',
  children,
}: {
  id?: string
  surface?: Surface
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={`py-section ${SURFACE_CLASS[surface]} ${className}`}>
      {children}
    </section>
  )
}
