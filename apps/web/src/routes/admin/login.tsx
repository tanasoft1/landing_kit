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
      // `messageFor` renders this panel's own string for every error code it knows, because the
      // server's `message` is Mongolian prose and the panel may be in English. An UNMAPPED code
      // falls back to that Mongolian text on purpose — a real description of what went wrong
      // beats a generic one, and an unmapped code is a bug to go and map.
      setFormError(err instanceof ApiError ? err.messageFor(t) : t.errUnknown)
    }
  }

  // Rendered from the field rather than from the resolver's message. Each field has exactly one
  // rule, so presence is all there is to say, and the string comes from the dictionary like every
  // other label — zod's own messages are English-only and would appear untranslated in a panel
  // set to Mongolian.
  //
  // Without these the form fails silently: `noValidate` suppresses the browser's bubble,
  // `handleSubmit` simply never calls `onSubmit`, and a bad email looks like a dead button.
  const { errors, isSubmitting } = form.formState

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
              {/* `aria-invalid` earns its keep twice: the screen reader announces the field as
                  invalid, and `input.tsx` already styles `aria-invalid:border-destructive`, so
                  the red border costs no class of its own here. */}
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
              // aria-live, because the message replaces itself in place after a submit a screen
              // reader has no other reason to revisit. The field errors above need none: they
              // appear beside a field the reader is about to be sent to, not in place.
              <p role="alert" aria-live="polite" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}

            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? t.signingIn : t.signIn}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
