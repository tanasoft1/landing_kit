// Two inputs decide the mode, and they are enough: a choice the visitor made here, then the
// one their operating system already expresses. There is no third "site default" fallback,
// because `matchMedia` always answers 'dark' or 'light' and never nothing, so any operand after
// it is unreachable. One used to sit there, wired to `site.theme.default`, and it could not fire.
export function ThemeScript() {
  const js = `(function(){try{var s=localStorage.getItem('kit-theme');var m=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(m==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: must run before first paint (can't be an effect); content is a fixed literal with no interpolation.
      dangerouslySetInnerHTML={{ __html: js }}
    />
  )
}
