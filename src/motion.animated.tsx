import { motion, useReducedMotion } from 'motion/react'
import { type ReactNode, useEffect, useState } from 'react'

type Props = { children: ReactNode; className?: string; delay?: number }

// `useReducedMotion` has no `matchMedia` to read during SSR, so the server always renders
// the animated branch. If a client's very first (hydration-matching) render branched on the
// real OS preference instead, a reduced-motion visitor's first render would disagree with
// the server-rendered HTML — and React does not patch up that kind of attribute mismatch
// during hydration, leaving the element frozen at its `initial` (invisible) style forever.
// Deferring the branch to a state that starts `false` and only flips after mount keeps the
// hydration pass matched, so the branch instead takes effect on a normal, fully-reconciled
// update afterward.
function useReducedMotionAfterMount() {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted && reduce
}

export function FadeIn({ children, className, delay = 0 }: Props) {
  const reduce = useReducedMotionAfterMount()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

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
