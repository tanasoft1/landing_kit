import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import { submitContact } from '~/submit'
import { contactSchema, MIN_ELAPSED_MS } from '~/submit-schema'
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

    // Timing guard, handled separately from field validation. If the fields are valid but the
    // submission arrived too fast, wait out the remainder rather than rejecting: a bot does not
    // stay to see the promise resolve, and a fast human should never be told their correct
    // fields are wrong. The user sees the normal "sending" state throughout.
    const elapsed = Date.now() - mountedAt.current
    if (elapsed < MIN_ELAPSED_MS) {
      await new Promise((r) => setTimeout(r, MIN_ELAPSED_MS - elapsed))
    }

    // Recomputed AFTER the wait, so it reflects real time on screen and satisfies the
    // server-side minimum that `submissionSchema` enforces.
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
            Honeypot. Three things matter here:
            - `-left-96` is a scale value, not an arbitrary `-left-[9999px]` bracket escape —
              blocks may not use arbitrary values, and the convention checker now catches them.
            - It must NOT be `display:none`: verify-build rejects hidden content, and bots
              detect it.
            - The field is named `honeypot_url`, not something like `company`, because browsers
              and password managers autofill recognised field names even with
              `autoComplete="off"` — and an autofilled honeypot silently discards a real lead,
              the one failure a client never reports and never forgives.
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
            The live region is ALWAYS mounted and only its text changes. A `role="status"`
            node inserted fresh on state change is announced inconsistently across
            screen-reader and browser combinations — so on a form whose entire purpose is
            lead capture, the failure message can go unheard by exactly the users who most
            need it.
          */}
          <p
            role="status"
            aria-live="polite"
            // Preset tokens, not `text-red-600`/`text-green-700`: a Tailwind palette colour does
            // not move when the preset swaps, and both read poorly on either preset's dark
            // background. Lighthouse never audits these — the region is `sr-only` until a
            // submission resolves — so the contrast was measured rather than eyeballed; see the
            // notes beside `--c-destructive`/`--c-success` in each preset.
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
