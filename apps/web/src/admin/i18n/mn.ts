/**
 * Every string the panel renders. Flat and keyed, not nested, so `keyof typeof mn` is the whole
 * surface and `en.ts` can be pinned to it.
 *
 * Every value is a finished string. Where a label needs a number in it, the call site composes
 * the two, so this file carries no placeholders and needs no interpolation machinery.
 */
export const mn = {
  panelTitle: 'Удирдлага',
  navLeads: 'Хүсэлтүүд',

  signIn: 'Нэвтрэх',
  signOut: 'Гарах',
  email: 'Имэйл',
  password: 'Нууц үг',
  signingIn: 'Нэвтэрч байна…',

  // Checked in the browser before anything is sent, so these describe the FORM rather than an
  // answer from the API. Kept out of the `err*` group for that reason: those are keyed by the
  // server's own error codes in lib/errors.ts.
  fieldEmailInvalid: 'Имэйл хаяг буруу байна',
  fieldPasswordRequired: 'Нууц үг оруулна уу',

  errInvalidCredentials: 'Имэйл эсвэл нууц үг буруу байна',
  errRateLimited: 'Хэт олон удаа оролдлоо. Хэсэг хүлээгээд дахин оролдоно уу.',
  errUnauthorized: 'Нэвтрэх хугацаа дууссан. Дахин нэвтэрнэ үү.',
  errNetwork: 'Сервертэй холбогдож чадсангүй',
  errUnknown: 'Алдаа гарлаа. Дараа дахин оролдоно уу.',

  leadsTitle: 'Хүсэлтүүд',
  colDate: 'Огноо',
  colName: 'Нэр',
  colEmail: 'Имэйл',
  colLocale: 'Хэл',
  colSource: 'Хуудас',
  colMessage: 'Захиа',
  rowActions: 'Үйлдэл',
  copyEmail: 'Имэйл хуулах',
  openMail: 'Имэйл бичих',
  viewLead: 'Дэлгэрэнгүй',
  emailCopied: 'Имэйл хуулагдлаа',

  noLeads: 'Одоогоор хүсэлт алга',
  previous: 'Өмнөх',
  next: 'Дараах',
}
