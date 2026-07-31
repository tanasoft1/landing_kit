import type { ReactNode } from 'react'

export function Container({
  className = '',
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`mx-auto w-full ${className}`}
      style={{ maxWidth: 'var(--container-max)', paddingInline: 'var(--container-gutter)' }}
    >
      {children}
    </div>
  )
}
