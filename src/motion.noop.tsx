import type { ReactNode } from 'react'
import type { MotionModule } from '@/motion.types'

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

// Drift between the two `~/motion` variants is a type error here, not a runtime surprise —
// tsconfig's `paths` only ever type-checks `~/motion` against motion.animated.tsx, so this
// file (KIT_ANIMATION=off) would otherwise be the one configuration nothing type-checks.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
