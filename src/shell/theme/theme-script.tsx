export function ThemeScript({ defaultMode }: { defaultMode: 'light' | 'dark' }) {
  const js = `(function(){try{var s=localStorage.getItem('kit-theme');var m=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')||'${defaultMode}';if(m==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
  return (
    <script
      // biome-ignore lint/security/noDangerouslySetInnerHtml: must run before first paint (can't be an effect); content is a literal with a constrained interpolation.
      dangerouslySetInnerHTML={{ __html: js }}
    />
  )
}
