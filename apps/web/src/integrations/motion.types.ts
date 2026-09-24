import type { ReactNode } from 'react'

export type MotionProps = { children: ReactNode; className?: string; delay?: number }
export type StaggerProps = { children: ReactNode; className?: string }

/** What `@/motion` must export. */
export type MotionModule = {
  FadeIn: (props: MotionProps) => ReactNode
  Reveal: (props: MotionProps) => ReactNode
  Stagger: (props: StaggerProps) => ReactNode
}
