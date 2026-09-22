import { zodResolver } from '@hookform/resolvers/zod'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { LanguageToggle } from '@/admin/components/language-toggle'
import { useT } from '@/admin/i18n/use-t'
import { login } from '@/admin/lib/api'
import { ApiError } from '@/admin/lib/errors'
import { Button } from '@/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/admin/ui/card'
import { Input } from '@/admin/ui/input'
import { Label } from '@/admin/ui/label'

const schema = z.object({
  email: z.email(),
  // Length is deliberately not checked here. A minimum on the SIGN-IN form tells an attacker the
  // password policy without them needing an account, and rejects nothing the server would accept.
  // seed-admin is where the 12-character floor belongs, and it is enforced there.
  password: z.string().min(1),
})

type Values = z.infer<typeof schema>

export const Route = createFileRoute('/admin/login')({
  component: LoginPage,
})

function LoginPage() {
  const t = useT()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (values: Values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      await navigate({ to: '/admin' })
    } catch (err) {
      // Switch on the machine-readable code, never render the server's own message directly:
      // it is Mongolian prose, and this panel may be in English.
      setFormError(err instanceof ApiError ? err.messageFor(t) : t.errUnknown)
    }
  }

  return (
    <main className="bg-background flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t.signIn}</CardTitle>
          <LanguageToggle />
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="email">{t.email}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                {...form.register('email')}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                {...form.register('password')}
              />
            </div>

            {formError !== null ? (
              // aria-live, because the message replaces itself in place after a submit a screen
              // reader has no other reason to revisit.
              <p role="alert" aria-live="polite" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t.signingIn : t.signIn}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
