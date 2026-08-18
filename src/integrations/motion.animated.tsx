import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import type { MotionModule } from '@/integrations/motion.types'

type Props = { children: ReactNode; className?: string; delay?: number }

// SSR has no `matchMedia`, so the server always renders the animated branch. A client render
// that branches on the real OS preference right away would then mismatch the hydrated HTML —
// React doesn't patch that kind of attribute mismatch, so the element freezes at `initial`
// forever. Flipping only when `reduce` resolves `true` (never on a generic "mounted" flag) also
// means the common case never re-renders after mount.
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
 * Animates TRANSFORM ONLY, never opacity: `initial={{ opacity: 0 }}` ships `style="opacity:0"`
 * in the static HTML, so a visitor with no JS sees a blank hero and LCP becomes JS-dependent.
 * `transform` alone stays fully opaque and can't cause CLS, so the offset is free.
 *
 * Want a real opacity fade above the fold? That's a deliberate LCP trade-off — re-check the
 * Lighthouse budget first.
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
 * Scroll-triggered entrance. Same TRANSFORM-only rule as `FadeIn`, with no exception for being
 * below the fold — off-screen at load isn't the same as absent from the document, and a
 * crawler that doesn't scroll would index content the page marked invisible.
 * `verify-build.mjs` enforces this with a blanket scan for `opacity:0` in the built HTML.
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

// Same no-opacity rule as `FadeIn`/`Reveal`: giving `hidden`/`shown` an `opacity` value here
// (or in a consumer's child variants) reintroduces the hidden-content problem those two avoid.
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

// Drift between the two `@/motion` variants is a type error here, not a runtime surprise —
// tsconfig's `paths` only ever type-checks `@/motion` against this file, so `KIT_ANIMATION=off`
// (motion.noop.tsx) would otherwise be the one configuration nothing type-checks.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
