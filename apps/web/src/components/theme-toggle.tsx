import { useEffect, useState } from 'react'

export function ThemeToggle({ label }: { label: string }) {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('kit-theme', next ? 'dark' : 'light')
    } catch {}
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      className="flex min-h-11 min-w-11 items-center justify-center text-sm"
    >
      {dark ? '☀' : '☾'}
    </button>
  )
}
