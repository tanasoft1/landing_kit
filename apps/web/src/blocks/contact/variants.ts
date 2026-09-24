import type { ComponentType } from 'react'
import type { BlockProps } from '@/lib/types'
import type { ContactVariant } from './block'
import { ContactForm } from './contact-form'
import type { ContactCopy } from './copy'

// The only static import of ContactForm. See hero/variants.ts.
export const variants = {
  default: ContactForm,
} satisfies Record<ContactVariant, ComponentType<BlockProps<ContactCopy>>>
