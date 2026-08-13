import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'
import type { MotionModule } from '~/motion.types'

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
 * Scroll-triggered entrance. Animates TRANSFORM ONLY — never opacity, for the same reason as
 * `FadeIn`, and with no exception for being below the fold: off-screen at load is not the same
 * as absent from the document. An `initial={{ opacity: 0 }}` still ships `style="opacity:0"`
 * in the prerendered HTML regardless of where the element sits on the page, so a visitor whose
 * JS fails sees a blank section, and a crawler that does not scroll indexes content the page
 * itself marked invisible — the identical robustness/indexing problem `FadeIn` exists to avoid,
 * just with a smaller LCP consequence. `verify-build.mjs` enforces this with a blanket scan for
 * `opacity:0` across the whole prerendered document, not scoped to any fold line — a block
 * cannot know which side of the fold it will land on, since page composition is config, so
 * there is one rule with no exceptions: this kit never ships hidden content.
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

// No opacity in either variant state: `shown`'s transition only staggers children, and
// `hidden` (the implicit initial variant) is never given its own declaration, so no opacity
// value ships here either. Same rule as `FadeIn`/`Reveal` above — if a future edit gives
// `hidden`/`shown` an `opacity` value (here or in a consumer's own child variants), it
// reintroduces the exact hidden-content problem those two exist to avoid.
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

// Drift between the two `~/motion` variants is a type error here, not a runtime surprise —
// tsconfig's `paths` only ever type-checks `~/motion` against this file, so `KIT_ANIMATION=off`
// (motion.noop.tsx) would otherwise be the one configuration nothing type-checks.
const _contract: MotionModule = { FadeIn, Reveal, Stagger }
void _contract
