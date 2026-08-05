import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Container } from '~/shell/layout/container'
import { Section } from '~/shell/layout/section'
import type { BlockProps } from '~/shell/types'
import { submitContact } from '~/submit'
import { contactSchema } from '~/submit-schema'
import type { ContactCopy } from './copy.mn'

type Fields = { name: string; email: string; message: string; company: string }

export function ContactForm({ copy, surface, anchorId }: BlockProps<ContactCopy>) {
  const { register, handleSubmit, reset } = useForm<Fields>()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const mountedAt = useRef(Date.now())

  async function onSubmit(values: Fields) {
    const parsed = contactSchema.safeParse({
      ...values,
      elapsedMs: Date.now() - mountedAt.current,
    })
    if (!parsed.success) {
      setState('error')
      setMessage(copy.validation)
      return
    }
    setState('sending')
    const result = await submitContact(parsed.data)
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
        <h1 className="text-h2 font-semibold">{copy.heading}</h1>
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

          <div aria-hidden="true" className="absolute -left-[9999px]">
            <input tabIndex={-1} autoComplete="off" {...register('company')} />
          </div>

          <button
            type="submit"
            disabled={state === 'sending'}
            className="bg-primary text-primary-foreground rounded-base min-h-11 px-6 py-3 font-medium disabled:opacity-60"
          >
            {state === 'sending' ? copy.submitting : copy.submit}
          </button>

          {message ? (
            <p
              role="status"
              className={state === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-700'}
            >
              {message}
            </p>
          ) : null}
        </form>
      </Container>
    </Section>
  )
}
