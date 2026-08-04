import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'

type Props = { children: ReactNode; className?: string; delay?: number }

// `useReducedMotion` has no `matchMedia` to read during SSR, so the server always renders
// the animated branch. If a client's very first (hydration-matching) render branched on the
// real OS preference instead, a reduced-motion visitor's first render would disagree with
// the server-rendered HTML — and React does not patch up that kind of attribute mismatch
// during hydration, leaving the element frozen at its `initial` style forever. Committing the
// branch-flip only when `reduce` actually resolves `true` — never on a generic "mounted" flag —
// means the common (non-reduced-motion) case never re-renders `motion.div` at all after mount,
// so there's no extra render competing with the entrance animation for that visitor.
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
 * Animates TRANSFORM ONLY — never opacity. `initial={{ opacity: 0 }}` would ship
 * `style="opacity:0"` in the prerendered HTML, so a visitor whose JS fails sees a blank hero,
 * and Lighthouse would not count the element as rendered until the bundle downloaded, hydrated
 * and animated — making LCP JS-dependent on exactly the throttled mobile preset the budget
 * uses. Content here is always fully opaque in the static HTML, just offset a few pixels.
 * `transform` cannot cause CLS, so the offset is free.
 *
 * If you want a real opacity fade above the fold, that is a deliberate LCP trade-off. Do it
 * knowingly, and re-check the Lighthouse budget.
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
 * Scroll-triggered entrance for BELOW-the-fold content only. Opacity is allowed here because
 * this content is off-screen at load and is never the LCP element — but do not use `Reveal` on
 * anything visible in the initial viewport, or it reintroduces the hidden-content problem
 * `FadeIn` exists to avoid.
 */
export function Reveal({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.5, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

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
