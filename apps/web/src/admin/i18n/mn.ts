/**
 * Every string the panel renders. Flat and keyed, not nested, so `keyof typeof mn` is the whole
 * surface and `en.ts` can be pinned to it.
 *
 * Ranges and counts are composed from numbers at the call site rather than templated here, so
 * this file needs no interpolation machinery for one label.
 */
export const mn = {
  panelTitle: 'Удирдлага',
  navLeads: 'Хүсэлтүүд',

  signIn: 'Нэвтрэх',
  signOut: 'Гарах',
  email: 'Имэйл',
  password: 'Нууц үг',
  signingIn: 'Нэвтэрч байна…',

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
