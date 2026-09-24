import type { ReactNode } from 'react'
import type { MotionModule } from '@/integrations/motion.types'

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

// Checks every export against the shared type. Callers only check what they import.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
