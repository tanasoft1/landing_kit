import type { ReactNode } from 'react'

export type MotionProps = { children: ReactNode; className?: string; delay?: number }
export type StaggerProps = { children: ReactNode; className?: string }

/** Every `~/motion` variant must satisfy this exact surface. */
export type MotionModule = {
  FadeIn: (props: MotionProps) => ReactNode
  Reveal: (props: MotionProps) => ReactNode
  Stagger: (props: StaggerProps) => ReactNode
}
