import type { ReactNode } from 'react'

type Props = { children: ReactNode; className?: string; delay?: number }

export function FadeIn({ children, className }: Props) {
  return <div className={className}>{children}</div>
}

export function Reveal({ children, className }: Props) {
  return <div className={className}>{children}</div>
}

export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
