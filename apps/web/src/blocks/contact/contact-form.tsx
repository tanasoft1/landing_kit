import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { contactSchema, MIN_ELAPSED_MS } from '@/integrations/submit-schema'
import type { BlockProps } from '@/lib/types'
import { submitContact } from '@/submit'
import type { ContactCopy } from './copy'

type Fields = { name: string; email: string; message: string; honeypot_url: string }

export function ContactForm({ copy, surface, anchorId, headingLevel }: BlockProps<ContactCopy>) {
  const H = headingLevel === 1 ? 'h1' : 'h2'
  const { register, handleSubmit, reset } = useForm<Fields>()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const mountedAt = useRef(Date.now())

  async function onSubmit(values: Fields) {
    const parsed = contactSchema.safeParse(values)
    if (!parsed.success) {
      setState('error')
      setMessage(copy.validation)
      return
    }

    setState('sending')

    // Too fast? Wait out the rest instead of rejecting. A fast human still gets through.
    const elapsed = Date.now() - mountedAt.current
    if (elapsed < MIN_ELAPSED_MS) {
      await new Promise((r) => setTimeout(r, MIN_ELAPSED_MS - elapsed))
    }

    const payload = { ...parsed.data, elapsedMs: Date.now() - mountedAt.current }
    const result = await submitContact(payload)
    if (result.ok) {
      setState('sent')
      setMessage(copy.success)
      reset()
    } else {
      setState('error')
      setMessage(copy.error)
    }
  }

  const field = 'border-border bg-background w-full rounded-base min-h-11 border px-4 py-3'

  return (
    <Section id={anchorId} surface={surface}>
      <Container width="narrow">
        <H className="text-h2 font-semibold">{copy.heading}</H>
        <p className="text-muted-foreground mt-3 text-lead">{copy.lead}</p>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-8 grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-medium">{copy.fields.name}</span>
            <input className={field} autoComplete="name" {...register('name')} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{copy.fields.email}</span>
            <input className={field} type="email" autoComplete="email" {...register('email')} />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{copy.fields.message}</span>
            <textarea className={field} rows={5} {...register('message')} />
          </label>

          {/* Honeypot. Moved off-screen, not display:none: verify-build rejects hidden content,
              and bots detect it. */}
          <div aria-hidden="true" className="absolute -left-96">
            <input
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              {...register('honeypot_url')}
            />
          </div>

          <button
            type="submit"
            disabled={state === 'sending'}
            className="bg-primary text-primary-foreground rounded-base min-h-11 px-6 py-3 font-medium disabled:opacity-60"
          >
            {state === 'sending' ? copy.submitting : copy.submit}
          </button>

          {/* Keep the live region mounted. Screen readers miss one inserted on change. */}
          <p
            role="status"
            aria-live="polite"
            // Preset tokens, not fixed colours, so they follow the preset.
            className={
              !message
                ? 'sr-only'
                : state === 'error'
                  ? 'text-destructive text-sm'
                  : 'text-success text-sm'
            }
          >
            {message}
          </p>
        </form>
      </Container>
    </Section>
  )
}
