import type { BlockManifest } from '@/lib/types'
import { type CtaCopy, en, mn } from './copy'

// No component imports here. See hero/block.ts.
const variantNames = ['banner', 'split'] as const

export type CtaVariant = (typeof variantNames)[number]

export const cta = {
  id: 'cta',
  variantNames,
  defaultVariant: 'banner',
  copy: { mn, en },
  // Link targets in ./copy.ts (primaryCta, secondaryCta). Keep in sync.
  requires: { blocks: ['contact', 'features'] },
} satisfies BlockManifest<CtaCopy, CtaVariant>
