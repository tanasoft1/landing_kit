import { createFileRoute, useNavigate } from '@tanstack/react-router'
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
import { ArrowDown, ArrowUp, ChevronsUpDown, MoreHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'
import { useT } from '@/admin/i18n/use-t'
import { apiFetch } from '@/admin/lib/api'
import { useLanguage } from '@/admin/lib/language'
import { Badge } from '@/admin/ui/badge'
import { Button } from '@/admin/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/admin/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/admin/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/admin/ui/table'

/** Matches models.RsLead in the Go service. snake_case, because that is what the API sends. */
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

// The API's own default. Its ceiling is 200; asking for more is silently clamped, so there is no
// value in going higher here than a person can scan.
const PAGE_SIZE = 50

const searchSchema = z.object({
  // `.catch(1)` rather than a validation error: ?page=banana in a pasted URL should show the
  // first page, not an error screen.
  //
  // `.default(1)` on top of it, and the two are not the same guard. `.catch` handles a value that
  // will not parse; `.default` handles the key not being there at all, which is what makes `page`
  // optional in this route's INPUT type. Without it the router counts `page` as a required search
  // param, and then `to: '/admin/leads'` is a type error everywhere it appears -- the nav <Link>
  // in admin-shell.tsx and the redirect in admin/index.tsx both have to start carrying
  // `search: { page: 1 }`. Optional in, always a number out, is the shape the rest of this file
  // is written against.
  page: z.coerce.number().int().min(1).catch(1).default(1),
})

export const Route = createFileRoute('/admin/_authed/leads')({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ page: search.page }),
  // The loader owns this data, not a module or a store. It reloads when `page` changes and
  // invalidates with the route, which is exactly the behaviour a hand-written cache would have
  // to reimplement.
  loader: ({ deps }) =>
    apiFetch<LeadPage>(`/admin/leads?limit=${PAGE_SIZE}&offset=${(deps.page - 1) * PAGE_SIZE}`),
  component: LeadsPage,
})

// v9 registers features explicitly instead of bundling them: only what is named here ships in
// the bundle, and only what is named here is available on the table. `stockFeatures` would turn
// everything on at once, which is the v8 shape and not what this table wants -- it sorts, and
// pages on the server.
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
})

// The feature set is part of the type, so the helper knows which column options exist. Getting
// this wrong surfaces as an unknown-property error on a column, not as a runtime surprise.
const columnHelper = createColumnHelper<typeof features, Lead>()

function LeadsPage() {
  const t = useT()
  const language = useLanguage()
  const navigate = useNavigate()
  const { page } = Route.useSearch()
  const { items, total } = Route.useLoaderData()

  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<Lead | null>(null)

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(language === 'mn' ? 'mn-MN' : 'en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [language],
  )

  // `columnHelper.columns([...])`, not a bare array literal. `ColumnDef` is invariant in its
  // value type, so a plain array of these seven widens to a union that `useTable` will not
  // accept: the date column is `ColumnDef<…, Lead, string>` and the actions column is
  // `ColumnDef<…, Lead, unknown>`, and neither is assignable to the other. `columns()` is the v9
  // helper for exactly this -- it keeps each entry's own value type and still types the whole as
  // one array.
  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor('created_at', {
          header: t.colDate,
          cell: (info) => dateFormat.format(new Date(info.getValue())),
        }),
        columnHelper.accessor('name', { header: t.colName }),
        columnHelper.accessor('email', { header: t.colEmail }),
        columnHelper.accessor('locale', {
          header: t.colLocale,
          cell: (info) => <Badge variant="secondary">{info.getValue()}</Badge>,
        }),
        columnHelper.accessor((row) => row.source_page ?? '', {
          id: 'source_page',
          header: t.colSource,
        }),
        columnHelper.accessor('message', {
          header: t.colMessage,
          // One line, truncated. Messages run to 4000 characters; the Sheet is where the whole
          // thing goes.
          cell: (info) => <span className="block max-w-xs truncate">{info.getValue()}</span>,
        }),
        columnHelper.display({
          id: 'actions',
          header: '',
          cell: (info) => <RowActions lead={info.row.original} onView={setSelected} />,
        }),
      ]),
    [t, dateFormat],
  )

  const table = useTable({
    features,
    data: items,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  })

  // No pagination options, and that is the whole of the server-side paging story here. v8 needed
  // `manualPagination: true` to stop the client paginator slicing rows the server had already
  // paged; v9 has no client paginator unless `rowPaginationFeature` is registered, and it is not.
  // Passing `manualPagination` or `pageCount` is a type error rather than a no-op. The page
  // arithmetic below is this component's own.

  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const last = Math.min(page * PAGE_SIZE, total)
  const goTo = (next: number) => navigate({ to: '/admin/leads', search: { page: next } })

  return (
    <section>
      <h1 className="text-h3 font-semibold">{t.leadsTitle}</h1>

      <div className="border-border rounded-base mt-4 overflow-x-auto border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  // False for the actions column, which has no accessor and so nothing to sort
                  // by. That is what keeps it a plain <th> with no button and no aria-sort.
                  const canSort = header.column.getCanSort()
                  const label = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <TableHead key={header.id} aria-sort={canSort ? ariaSort(sorted) : undefined}>
                      {canSort ? (
                        // A real <button>, not an onClick on the <th>. The header has to be
                        // reachable by keyboard and announced as pressable, and `aria-sort` on
                        // the cell above says which way it is currently pointing.
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="flex items-center gap-1"
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-muted-foreground text-center">
                  {t.noLeads}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {/* getAllCells, not v8's getVisibleCells. Column visibility is its own
                      registered feature in v9 and this table does not register it, so the
                      "visible" variant does not exist on the row at all. */}
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {/* Numerals and an en dash, no prose. A range label needs no dictionary entry and reads
            the same in both languages. */}
        <span className="text-muted-foreground text-sm">
          {first}–{last} / {total}
        </span>
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goTo(page - 1)}>
          {t.previous}
        </Button>
        <Button variant="outline" size="sm" disabled={last >= total} onClick={() => goTo(page + 1)}>
          {t.next}
        </Button>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{selected?.name}</SheetTitle>
          </SheetHeader>
          {selected !== null ? (
            <dl className="mt-4 grid gap-3 text-sm">
              <Field label={t.colEmail} value={selected.email} />
              <Field label={t.colDate} value={dateFormat.format(new Date(selected.created_at))} />
              <Field label={t.colSource} value={selected.source_page ?? '—'} />
              <div>
                <dt className="text-muted-foreground">{t.colMessage}</dt>
                {/* whitespace-pre-wrap, never dangerouslySetInnerHTML. This string came from a
                    public form. check-conventions.mjs enforces that. */}
                <dd className="mt-1 whitespace-pre-wrap">{selected.message}</dd>
              </div>
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </section>
  )
}

/** What `column.getIsSorted()` returns: a direction, or `false` for a column nobody has sorted. */
type SortDir = false | 'asc' | 'desc'

function ariaSort(sorted: SortDir): 'ascending' | 'descending' | 'none' {
  if (sorted === 'asc') return 'ascending'
  if (sorted === 'desc') return 'descending'
  return 'none'
}

function SortIcon({ sorted }: { sorted: SortDir }) {
  if (sorted === 'asc') return <ArrowUp className="size-3.5" />
  if (sorted === 'desc') return <ArrowDown className="size-3.5" />
  // Drawn on every sortable header, not only the active one, so a column says it can be sorted
  // before anyone has clicked it.
  return <ChevronsUpDown className="text-muted-foreground size-3.5" />
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  )
}

function RowActions({ lead, onView }: { lead: Lead; onView: (lead: Lead) => void }) {
  const t = useT()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label={t.rowActions}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onView(lead)}>{t.viewLead}</DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            // Clipboard access can be refused (insecure origin, denied permission). A silent
            // no-op would look like the click missed, so failure gets the same feedback path.
            navigator.clipboard.writeText(lead.email).then(
              () => toast.success(t.emailCopied),
              () => toast.error(t.errUnknown),
            )
          }}
        >
          {t.copyEmail}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`mailto:${lead.email}`}>{t.openMail}</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
