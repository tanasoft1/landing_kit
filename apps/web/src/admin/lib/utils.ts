import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Hand-written. Newer shadcn CLIs import `cn` from an npm package instead; components.json
// points here.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
