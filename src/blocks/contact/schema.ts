import type { BlockSchema } from '~/shell/types'
import type { ContactCopy } from './copy.mn'

export const schema: BlockSchema<ContactCopy> = ({ copy, site }) => [
  {
    '@type': 'ContactPage',
    name: copy.heading,
    description: copy.lead,
    isPartOf: { '@id': `${site.url}/#website` },
  },
]
