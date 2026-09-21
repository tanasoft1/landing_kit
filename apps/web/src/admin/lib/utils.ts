import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The class-name merge every component under `src/admin/` uses: `clsx` flattens conditionals,
 * `twMerge` then drops the Tailwind utility a later one overrides, so `cn('p-2', 'p-4')` is `p-4`
 * rather than both.
 *
 * Written by hand rather than by the shadcn CLI, which as of 4.21 no longer emits this file: it
 * writes `import { cn } from 'cn'` and installs an npm package by that name instead. This is the
 * file `components.json`'s `utils` alias names, and eleven of the twelve components under
 * `src/admin/ui/` import it -- all but `sonner.tsx`, which composes no class strings -- so the
 * one-package dependency is not worth taking.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
