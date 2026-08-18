import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Container } from '@/components/layout/container'
import { Section } from '@/components/layout/section'
import { contactSchema, MIN_ELAPSED_MS } from '@/integrations/submit-schema'
import type { BlockProps } from '@/lib/types'
import { submitContact } from '@/submit'
import type { ContactCopy } from './copy.mn'

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

    // Timing guard, separate from field validation. If valid but too fast, wait out the
    // remainder rather than rejecting: a bot won't stay for the promise to resolve, and a fast
    // human should never be told their correct fields are wrong.
    const elapsed = Date.now() - mountedAt.current
    if (elapsed < MIN_ELAPSED_MS) {
      await new Promise((r) => setTimeout(r, MIN_ELAPSED_MS - elapsed))
    }

    // Recomputed after the wait, so it reflects real time on screen and passes the
    // server-side minimum `submissionSchema` enforces.
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

          {/*
            Honeypot. `-left-96` is a scale value, not an arbitrary `-left-[9999px]` bracket
            escape (blocks may not use those). Not `display:none`: verify-build rejects hidden
            content, and bots detect it. Named `honeypot_url`, not e.g. `company`: autofill
            matches recognised field names even with `autoComplete="off"`, and an autofilled
            honeypot loses a real lead.
          */}
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

          {/*
            The live region is always mounted; only its text changes. A `role="status"` node
            inserted fresh on state change is announced inconsistently across screen readers.
          */}
          <p
            role="status"
            aria-live="polite"
            // Preset tokens, not stock Tailwind colours: a fixed colour wouldn't move with a
            // preset swap, and Lighthouse never audits this (sr-only until resolved), so contrast
            // was measured, not eyeballed — see `--c-destructive`/`--c-success` in each preset.
            // The replaced class names aren't written out here: Tailwind's scanner is
            // comment-blind, and naming them would keep the dead utilities in the built CSS.
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
