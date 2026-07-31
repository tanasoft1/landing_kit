import type { BlockSchema } from '~/shell/types'
import type { HeroCopy } from './copy.mn'

export const schema: BlockSchema<HeroCopy> = ({ copy, site }) => [
  {
    '@type': 'WebPageElement',
    name: copy.heading,
    description: copy.lead,
    isPartOf: { '@id': `${site.url}/#website` },
  },
]
