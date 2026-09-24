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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/admin/ui/card'
import { Input } from '@/admin/ui/input'
import { Label } from '@/admin/ui/label'
import { site } from '@/config/site.config'

const schema = z.object({
  email: z.email(),
  // No length rule on sign-in. It would reveal the password policy. seed-admin enforces it.
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
      setFormError(err instanceof ApiError ? err.messageFor(t) : t.errUnknown)
    }
  }

  // Field errors come from the dictionary, not zod, whose messages are English-only.
  // With `noValidate`, a form without them fails silently.
  const { errors, isSubmitting } = form.formState

  return (
    <main className="bg-muted relative flex min-h-screen flex-col items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>
      <p className="font-display mb-6 text-lg font-bold">{site.name}</p>
      <Card className="w-full max-w-sm gap-5">
        <CardHeader>
          <CardTitle className="font-display text-xl font-bold">{t.signIn}</CardTitle>
          <CardDescription>{t.signInHint}</CardDescription>
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
                aria-invalid={errors.email !== undefined}
                aria-describedby={errors.email !== undefined ? 'email-error' : undefined}
                {...form.register('email')}
              />
              {errors.email !== undefined ? (
                <p id="email-error" role="alert" className="text-destructive text-sm">
                  {t.fieldEmailInvalid}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t.password}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                aria-invalid={errors.password !== undefined}
                aria-describedby={errors.password !== undefined ? 'password-error' : undefined}
                {...form.register('password')}
              />
              {errors.password !== undefined ? (
                <p id="password-error" role="alert" className="text-destructive text-sm">
                  {t.fieldPasswordRequired}
                </p>
              ) : null}
            </div>

            {formError !== null ? (
              <p role="alert" aria-live="polite" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting} className="mt-1">
              {isSubmitting ? t.signingIn : t.signIn}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
