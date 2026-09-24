// Stored choice, else the OS setting. A site-default fallback after matchMedia could never run.
export function ThemeScript() {
  const js = `(function(){try{var s=localStorage.getItem('kit-theme');var m=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');if(m==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: must run before first paint (can't be an effect); content is a fixed literal with no interpolation.
      dangerouslySetInnerHTML={{ __html: js }}
    />
  )
}
