import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import type { MotionModule } from '@/integrations/motion.types'

type Props = { children: ReactNode; className?: string; delay?: number }

// The server has no `matchMedia`, so it always renders the animated branch. If the client read
// the real OS preference during hydration the HTML would mismatch, and React does not patch
// that kind of mismatch — the element would freeze at `initial` forever. So flip only after
// mount, and only when `reduce` is true, which means the common case never re-renders.
function useReducedMotionAfterMount() {
  const reduce = useReducedMotion()
  const [committed, setCommitted] = useState(false)
  useEffect(() => {
    if (reduce) setCommitted(true)
  }, [reduce])
  return committed
}

/**
 * On-load entrance for above-the-fold content, including the LCP element.
 *
 * Animates TRANSFORM ONLY, never opacity. `initial={{ opacity: 0 }}` puts `style="opacity:0"`
 * into the static HTML, so a visitor with no JS sees a blank hero. A transform stays fully
 * opaque and cannot shift the layout, so the offset is free.
 *
 * Want a real opacity fade above the fold? That is an LCP trade-off — measure LCP first.
 */
export function FadeIn({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ y: 12 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/**
 * Scroll-triggered entrance. Same TRANSFORM-only rule as `FadeIn`, and being below the fold is
 * not an exception: off-screen is not the same as absent, and a crawler that never scrolls
 * would still read content the page marked invisible. `verify-build.mjs` scans the built HTML
 * for `opacity:0` and fails on any match.
 */
export function Reveal({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ y: 16 }}
      whileInView={{ y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

// Same no-opacity rule as `FadeIn` and `Reveal`. Giving `hidden`/`shown` an `opacity` value
// here, or in a caller's child variants, brings back the hidden-content problem.
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2 }}
      variants={{ shown: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  )
}

// Type-checks this file against the shared `@/motion` surface, so the two variants cannot drift
// apart. `tsconfig` points `@/motion` at this file only, which is why motion.noop.tsx needs the
// same line: without it, `KIT_ANIMATION=off` is the one setup nothing type-checks.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
