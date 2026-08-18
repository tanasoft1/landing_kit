export type ContactCopy = {
  navLabel: string
  heading: string
  lead: string
  fields: { name: string; email: string; message: string }
  submit: string
  submitting: string
  success: string
  error: string
  validation: string
}

export const mn: ContactCopy = {
  navLabel: 'Холбоо барих',
  heading: 'Бидэнтэй холбогдоно уу',
  lead: 'Хүсэлтээ илгээгээрэй, бид ажлын өдөрт хариу барина.',
  fields: { name: 'Нэр', email: 'И-мэйл', message: 'Захидал' },
  submit: 'Илгээх',
  submitting: 'Илгээж байна…',
  success: 'Баярлалаа! Бид тантай холбогдоно.',
  error: 'Илгээхэд алдаа гарлаа. Дахин оролдоно уу.',
  validation: 'Бүх талбарыг зөв бөглөнө үү.',
}

export const en: ContactCopy = {
  navLabel: 'Contact',
  heading: 'Get in touch',
  lead: 'Send us a message and we will reply within one business day.',
  fields: { name: 'Name', email: 'Email', message: 'Message' },
  submit: 'Send',
  submitting: 'Sending…',
  success: 'Thank you! We will be in touch.',
  error: 'Something went wrong. Please try again.',
  validation: 'Please complete every field correctly.',
}
