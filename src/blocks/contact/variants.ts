import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import { ContactForm } from './contact-form'
import type { ContactCopy } from './copy.mn'
import type { ContactVariant } from './manifest'

// The only static import of this component anywhere — see hero/variants.ts for why. This is the
// module that matters most: `ContactForm` pulls in `react-hook-form` and `zod` (99 KB raw / 30 KB
// gzip), and it is the whole reason this split point exists.
//
// `satisfies Record<ContactVariant, …>`: a variant declared in manifest.ts but missing here is a
// compile error, not a silently empty preview on `/docs`. See hero/variants.ts.
export const variants = {
  default: ContactForm,
} satisfies Record<ContactVariant, ComponentType<BlockProps<ContactCopy>>>
