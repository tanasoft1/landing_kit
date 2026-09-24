import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSortingFeature,
  type SortingState,
  sortFns,
  tableFeatures,
  useTable,
} from '@tanstack/react-table'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Copy,
  Inbox,
  Mail,
  MoreHorizontal,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useT } from '@/admin/i18n/use-t'
import { apiFetch } from '@/admin/lib/api'
import { ApiError } from '@/admin/lib/errors'
import { type PanelLanguage, useLanguage } from '@/admin/lib/language'
import { Badge } from '@/admin/ui/badge'
import { Button } from '@/admin/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/admin/ui/dropdown-menu'
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@/admin/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/ui/table'

// Matches the API's lead JSON, so snake_case.
type Lead = {
  id: string
  name: string
  email: string
  message: string
  locale: string
  source_page?: string
  ip?: string
  user_agent?: string
  created_at: string
}

type LeadPage = { items: Lead[]; total: number }

// The API clamps limit to 200.
const PAGE_SIZE = 50

const searchSchema = z.object({
  // `.catch` turns ?page=banana into page 1. `.default` makes `page` optional, so links to
  // '/admin/leads' need no `search`. Keep both.
  page: z.coerce.number().int().min(1).catch(1).default(1),
})

export const Route = createFileRoute('/admin/_authed/leads')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  loader: async ({ deps }) => {
    try {
      return await apiFetch<LeadPage>(
        `/admin/leads?limit=${PAGE_SIZE}&offset=${(deps.page - 1) * PAGE_SIZE}`,
      )
    } catch (err) {
      // apiFetch already tried a refresh, so a 401 means the session is gone.
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: '/admin/login' })
      // Other errors go to the error boundary. A 500 is no reason to ask for a password.
      throw err
    }
  },
  component: LeadsPage,
})

// Only sorting is registered. Paging happens on the server, so don't add rowPaginationFeature.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

const columnHelper = createColumnHelper<typeof features, Lead>()

function LeadsPage() {
  const t = useT()
  const language = useLanguage()
  const navigate = useNavigate()
  const { page } = Route.useSearch()
  const { items, total } = Route.useLoaderData()

  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<Lead | null>(null)

  const formatDate = useMemo(() => dateFormatter(language), [language])

  // columnHelper.columns(), not a plain array. A plain array of mixed value types fails to type.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('name', {
          header: t.colName,
          // The name button stretches over the whole row: click anywhere, one tab stop per row.
          cell: (info) => {
            const lead = info.row.original
            return (
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => setSelected(lead)}
                  className="block max-w-full truncate text-left font-medium after:absolute after:inset-0 focus-visible:outline-none"
                >
                  {lead.name}
                </button>
                <span className="text-muted-foreground block truncate">{lead.email}</span>
              </div>
            )
          },
        }),
        columnHelper.accessor('message', {
          header: t.colMessage,
          cell: (info) => (
            <span className="text-muted-foreground line-clamp-2 whitespace-normal">
              {info.getValue()}
            </span>
          ),
        }),
        columnHelper.accessor((row) => row.source_page ?? '', {
          id: 'source_page',
          header: t.colSource,
          cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span>,
        }),
        columnHelper.accessor('locale', {
          header: t.colLocale,
          cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
        }),
        columnHelper.accessor('created_at', {
          header: t.colDate,
          // Compare as times, not strings. String order breaks when rows carry different offsets.
          sortFn: (a, b) => Date.parse(a.original.created_at) - Date.parse(b.original.created_at),
          cell: (info) => (
            <span className="text-muted-foreground tabular-nums">
              {formatDate(info.getValue())}
            </span>
          ),
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          cell: (info) => <RowActions lead={info.row.original} onView={setSelected} />,
        }),
      ]),
    [t, formatDate],
  )

  const table = useTable({
    features,
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  })

  // Count from the rows that came back, not the page number. A ?page= past the end returns
  // empty `items` with the real `total`.
  const first = items.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = first === 0 ? 0 : first + items.length - 1
  const goTo = (next: number) => navigate({ to: '/admin/leads', search: { page: next } })
  const rows = table.getRowModel().rows

  return (
    <section className="mx-auto max-w-6xl">
      <div className="flex items-baseline gap-3">
        <h1 className="text-h3 font-bold">{t.leadsTitle}</h1>
        <span className="text-muted-foreground tabular-nums">{total}</span>
      </div>

      {rows.length === 0 ? (
        <div className="border-border rounded-base mt-6 flex flex-col items-center border border-dashed px-6 py-16 text-center">
          <Inbox className="text-muted-foreground size-8" aria-hidden />
          <p className="mt-4 font-medium">{t.noLeads}</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">{t.noLeadsHint}</p>
        </div>
      ) : (
        <>
          <ul className="border-border rounded-base mt-6 divide-border divide-y border md:hidden">
            {rows.map((row) => {
              const lead = row.original
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(lead)}
                    className="hover:bg-muted block w-full px-4 py-3 text-left transition-colors"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{lead.name}</span>
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {formatDate(lead.created_at)}
                      </span>
                    </span>
                    <span className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {lead.message}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="border-border rounded-base mt-6 hidden overflow-hidden border md:block">
            <Table className="table-fixed">
              <colgroup>
                <col className="w-[24%]" />
                <col />
                <col className="w-32" />
                <col className="w-20" />
                <col className="w-44" />
                <col className="w-14" />
              </colgroup>
              <TableHeader className="bg-muted">
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id} className="hover:bg-transparent">
                    {group.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const canSort = header.column.getCanSort()
                      const label = header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())
                      return (
                        <TableHead
                          key={header.id}
                          aria-sort={canSort ? ariaSort(sorted) : undefined}
                          className="text-muted-foreground h-10 px-4 text-xs font-medium"
                        >
                          {canSort ? (
                            // A real <button>, not onClick on the <th>, so keyboards reach it.
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="hover:text-foreground flex items-center gap-1 transition-colors"
                            >
                              {label}
                              <SortIcon sorted={sorted} />
                            </button>
                          ) : (
                            label
                          )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  // `relative` holds the name button's stretched hit area inside this row.
                  <TableRow
                    key={row.id}
                    className="has-focus-visible:ring-ring relative cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-inset"
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id} className="px-4 py-3 align-top">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Shown on an empty page past the end too, so Previous can lead back. */}
      {total > 0 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="text-muted-foreground mr-2 text-sm tabular-nums">
            {first}–{last} / {total}
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
            <ChevronLeft aria-hidden />
            {t.previous}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={items.length === 0 || last >= total}
            onClick={() => goTo(page + 1)}
          >
            {t.next}
            <ChevronRight aria-hidden />
          </Button>
        </div>
      ) : null}

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full gap-0 sm:max-w-lg" closeLabel={t.close}>
          {selected !== null ? (
            <>
              <SheetHeader className="border-border border-b px-6 pt-6 pb-5">
                <SheetTitle className="font-display pr-8 text-xl font-bold">
                  {selected.name}
                </SheetTitle>
                <a
                  href={`mailto:${selected.email}`}
                  className="text-primary w-fit text-sm break-all underline-offset-4 hover:underline"
                >
                  {selected.email}
                </a>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <dl className="flex flex-wrap gap-x-10 gap-y-4 text-sm">
                  <Field label={t.colDate} value={formatDate(selected.created_at)} />
                  <Field label={t.colSource} value={selected.source_page || '—'} />
                  <Field label={t.colLocale} value={selected.locale} />
                </dl>

                <h2 className="text-muted-foreground mt-6 text-sm">{t.colMessage}</h2>
                {/* Never dangerouslySetInnerHTML. This text came from a public form. */}
                <p className="bg-muted rounded-base mt-2 p-4 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {selected.message}
                </p>
              </div>

              <SheetFooter className="border-border flex-row border-t px-6 py-4">
                <Button asChild className="flex-1">
                  <a href={`mailto:${selected.email}`}>
                    <Mail aria-hidden />
                    {t.openMail}
                  </a>
                </Button>
                <Button variant="outline" onClick={() => copyEmail(selected.email, t)}>
                  <Copy aria-hidden />
                  {t.copyEmail}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  )
}

// Browsers ship no Mongolian date names (`mn-MN` falls back to English), so Mongolian gets a
// numeric date instead: 2026.09.24 14:05.
function dateFormatter(language: PanelLanguage): (iso: string) => string {
  if (language === 'en') {
    const f = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    return (iso) => f.format(new Date(iso))
  }
  const f = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return (iso) => {
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
    return `${p.year}.${p.month}.${p.day} ${p.hour}:${p.minute}`
  }
}

type SortDir = false | 'asc' | 'desc'

function ariaSort(sorted: SortDir): 'ascending' | 'descending' | 'none' {
  if (sorted === 'asc') return 'ascending'
  if (sorted === 'desc') return 'descending'
  return 'none'
}

function SortIcon({ sorted }: { sorted: SortDir }) {
  if (sorted === 'asc') return <ArrowUp className="size-3.5" />
  if (sorted === 'desc') return <ArrowDown className="size-3.5" />
  return <ChevronsUpDown className="text-muted-foreground size-3.5" />
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  )
}

// Clipboard can be refused. Show an error, or the click looks like it missed.
function copyEmail(email: string, t: ReturnType<typeof useT>) {
  navigator.clipboard.writeText(email).then(
    () => toast.success(t.emailCopied),
    () => toast.error(t.errUnknown),
  )
}

function RowActions({ lead, onView }: { lead: Lead; onView: (lead: Lead) => void }) {
  const t = useT()
  return (
    // Above the name button's stretched hit area, so the menu opens instead of the lead.
    <div className="relative z-10 flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t.rowActions}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onView(lead)}>{t.viewLead}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => copyEmail(lead.email, t)}>
            {t.copyEmail}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`mailto:${lead.email}`}>{t.openMail}</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
