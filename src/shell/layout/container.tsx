import type { ReactNode } from 'react'

const WIDTH = {
  page: 'max-w-page',
  narrow: 'max-w-narrow',
} as const

export function Container({
  width = 'page',
  className = '',
  children,
}: {
  width?: keyof typeof WIDTH
  className?: string
  children: ReactNode
}) {
  return <div className={`mx-auto w-full px-gutter ${WIDTH[width]} ${className}`}>{children}</div>
}
