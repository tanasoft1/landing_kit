export function themeScript(defaultMode: 'light' | 'dark'): string {
  return `(function(){try{var s=localStorage.getItem('kit-theme');var m=s||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')||'${defaultMode}';if(m==='dark')document.documentElement.classList.add('dark')}catch(e){}})()`
}
