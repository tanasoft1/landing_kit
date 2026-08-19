// The real implementations. Imported and then re-exported, not `export … from`, so the contract
// check at the bottom can actually see them. A bare re-export matches any signature and would
// check nothing.
import { ThemeScript } from '@/components/theme-script'
import { ThemeToggle } from '@/components/theme-toggle'
import type { ThemeModule } from '@/integrations/theme.types'

export { ThemeScript, ThemeToggle }

const _contract: ThemeModule = { ThemeScript, ThemeToggle }
void _contract
