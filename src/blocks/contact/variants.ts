import { ContactForm } from './contact-form'

// The only static import of this component anywhere — see hero/variants.ts for why. This is the
// module that matters most: `ContactForm` pulls in `react-hook-form` and `zod` (99 KB raw / 30 KB
// gzip), and it is the whole reason this split point exists.
export const variants = { default: ContactForm }
