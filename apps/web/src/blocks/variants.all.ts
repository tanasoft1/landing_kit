import { variants as contact } from './contact/variants'
import { variants as cta } from './cta/variants'
import { variants as features } from './features/variants'
import { variants as hero } from './hero/variants'
import type { BlockId } from './registry'
import { registerVariants } from './variant-registry'

// Server-only. Never import it from the client entry, or every block lands in the client bundle.
// The Record type makes a missing block a compile error.
const all: Record<BlockId, Parameters<typeof registerVariants>[1]> = {
  hero,
  features,
  cta,
  contact,
}

for (const [id, variants] of Object.entries(all)) registerVariants(id as BlockId, variants)
