// Import then re-export, not `export … from`, so the contract check below sees them.
import { ThemeScript } from '@/components/theme-script'
import { ThemeToggle } from '@/components/theme-toggle'
import type { ThemeModule } from '@/integrations/theme.types'

export { ThemeScript, ThemeToggle }

const _contract: ThemeModule = { ThemeScript, ThemeToggle }
void _contract
