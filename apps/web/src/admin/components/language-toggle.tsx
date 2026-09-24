import { getLanguage, setLanguage, useLanguage } from '@/admin/lib/language'
import { Button } from '@/admin/ui/button'

export function LanguageToggle() {
  const language = useLanguage()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setLanguage(getLanguage() === 'mn' ? 'en' : 'mn')}
      aria-label={language === 'mn' ? 'Switch to English' : 'Монгол руу шилжих'}
    >
      {language === 'mn' ? 'EN' : 'МН'}
    </Button>
  )
}
