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

// Type-checks this file against the shared `@/motion` surface, so the two variants cannot drift
// apart. `tsconfig` points `@/motion` at motion.animated.tsx only, so without this line this
// file (`KIT_ANIMATION=off`) is the one setup nothing type-checks.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
