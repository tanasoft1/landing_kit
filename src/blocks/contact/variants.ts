import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import { ContactForm } from './contact-form'
import type { ContactCopy } from './copy.mn'
import type { ContactVariant } from './manifest'

// The only place this component is imported statically — see hero/variants.ts for why. This is
// the module that matters most: `ContactForm` pulls in `react-hook-form` and `zod` (99 KB raw,
// 30 KB gzipped), which is the whole reason the split point exists.
//
// `satisfies Record<ContactVariant, …>` makes a variant declared in manifest.ts but missing here
// a compile error, instead of an empty preview on `/docs`. See hero/variants.ts.
export const variants = {
  default: ContactForm,
} satisfies Record<ContactVariant, ComponentType<BlockProps<ContactCopy>>>
