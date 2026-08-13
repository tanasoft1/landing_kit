// The real implementations.
// Imported and re-exported rather than `export … from`, so the contract assertion below can
// actually see them. A bare re-export would match any signature and check nothing.
import { ThemeScript } from '@/shell/theme/theme-script'
import { ThemeToggle } from '@/shell/theme/theme-toggle'
import type { ThemeModule } from '@/theme.types'

export { ThemeScript, ThemeToggle }

const _contract: ThemeModule = { ThemeScript, ThemeToggle }
void _contract
