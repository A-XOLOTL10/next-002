import Link from "next/link"
import AdminNav from "@/components/admin/AdminNav"
import { requireSuperAdmin } from "@/lib/auth"
import { PAGE_SIZE, RANGES, parseLogFilters, queryLogs, type LogFilters, type RangeKey } from "@/lib/logs-data"
import { LOG_CATEGORIES, LOG_CATEGORY_LABELS, LOG_SEVERITIES, LOG_RETENTION_DAYS } from "@/database/audit-log.model"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const SEVERITY_STYLE = { info: "text-light-200", warning: "text-amber-400", critical: "text-red-400" } as const
const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "Africa/Lagos" }).format(new Date(iso))
const timeLabel = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeStyle: "medium", timeZone: "Africa/Lagos" }).format(new Date(iso))

/** A link to this page with some filters changed (and back to page 1). */
function href(filters: LogFilters, change: Partial<LogFilters>): string {
  const next = { ...filters, page: 1, ...change }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === "" || (key === "page" && value === 1) || (key === "range" && value === "7d")) continue
    if (next.range !== "custom" && (key === "from" || key === "to")) continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return `/host/console/logs${query ? `?${query}` : ""}`
}

const Chip = ({ active, to, children }: { active: boolean; to: string; children: React.ReactNode }) => (
  <Link href={to} className={`rounded-full border px-3 py-1 text-sm ${active ? "border-primary bg-primary/15 text-white" : "border-dark-200 hover:border-primary"}`} aria-current={active ? "true" : undefined}>
    {children}
  </Link>
)

// The activity log (super admin only): every sign-in, decision, edit and click by the team,
// kept 12 months. Filter buttons for category, severity and dates; a person picker and search;
// every filter lives in the address, and the CSV export uses the same filters.
export default async function LogsPage({ searchParams }: PageProps<"/host/console/logs">) {
  await requireSuperAdmin()
  const filters = parseLogFilters(await searchParams)
  const data = await queryLogs(filters)
  const exportQuery = href(filters, {}).split("?")[1] ?? ""

  // Group entries under day headings.
  const days: { day: string; rows: typeof data.entries }[] = []
  for (const row of data.entries) {
    const day = dayLabel(row.at)
    if (days.at(-1)?.day !== day) days.push({ day, rows: [] })
    days.at(-1)!.rows.push(row)
  }

  return (
    <>
      <AdminNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Activity log</h1>
          <p className="text-light-100 text-sm">Every action by the team and hosts. Kept {LOG_RETENTION_DAYS / 30} months, then deleted automatically. Times are WAT.</p>
        </div>
        <a href={`/api/console/logs/export${exportQuery ? `?${exportQuery}` : ""}`} className="admin-button">Export CSV</a>
      </div>

      {/* ---- filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Category">
          <Chip active={!filters.category} to={href(filters, { category: undefined })}>All ({data.total})</Chip>
          {LOG_CATEGORIES.map((c) => (
            <Chip key={c} active={filters.category === c} to={href(filters, { category: c })}>{LOG_CATEGORY_LABELS[c]} {data.byCategory[c] !== undefined && !filters.category ? `(${data.byCategory[c]})` : ""}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Severity">
          <Chip active={!filters.severity} to={href(filters, { severity: undefined })}>Any severity</Chip>
          {LOG_SEVERITIES.map((s) => (
            <Chip key={s} active={filters.severity === s} to={href(filters, { severity: s })}><span className={SEVERITY_STYLE[s]}>{s}</span> {data.bySeverity[s] ? `(${data.bySeverity[s]})` : ""}</Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Dates">
          {(Object.keys(RANGES) as RangeKey[]).filter((r) => r !== "custom").map((r) => (
            <Chip key={r} active={filters.range === r} to={href(filters, { range: r })}>{RANGES[r]}</Chip>
          ))}
        </div>
        {/* A plain GET form: it just changes the address. */}
        <form action="/host/console/logs" className="flex flex-wrap items-end gap-3 text-sm">
          {filters.category && <input type="hidden" name="category" value={filters.category} />}
          {filters.severity && <input type="hidden" name="severity" value={filters.severity} />}
          <input type="hidden" name="range" value="custom" />
          <label className="flex flex-col gap-1">From<input type="date" name="from" defaultValue={filters.range === "custom" ? filters.from : undefined} className="admin-input" /></label>
          <label className="flex flex-col gap-1">To<input type="date" name="to" defaultValue={filters.range === "custom" ? filters.to : undefined} className="admin-input" /></label>
          <label className="flex flex-col gap-1">Person
            <select name="actor" defaultValue={filters.actor ?? ""} className="admin-input">
              <option value="">Everyone</option>
              {data.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="flex min-w-56 flex-1 flex-col gap-1">Search
            <input name="q" defaultValue={filters.q} placeholder="Event, ticket ID, email, IP..." className="admin-input" />
          </label>
          <button type="submit" className="admin-button">Apply</button>
          <Link href="/host/console/logs" className="py-2.5 hover:underline">Reset</Link>
        </form>
      </div>

      {/* ---- summary */}
      {data.activeTime.length > 0 && (
        <section className="bg-dark-100 border-dark-200 flex flex-wrap gap-6 rounded-[10px] border p-4 text-sm">
          <span className="font-semibold">Active time in this period:</span>
          {data.activeTime.map((t) => <span key={t.name}>{t.name}: <strong>{t.minutes >= 60 ? `${Math.floor(t.minutes / 60)} h ${t.minutes % 60} min` : `${t.minutes} min`}</strong></span>)}
        </section>
      )}

      {/* ---- entries */}
      {days.length === 0 ? (
        <p className="text-light-200">Nothing matches these filters.</p>
      ) : (
        days.map(({ day, rows }) => (
          <section key={day} className="flex flex-col gap-2">
            <h2 className="text-light-200 border-dark-200 border-b pb-1 text-sm font-semibold">{day}</h2>
            {rows.map((row) => (
              <details key={row.id} className="bg-dark-100 border-dark-200 rounded-md border px-3 py-2 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3">
                  <span className="text-light-200 font-mono text-xs">{timeLabel(row.at)}</span>
                  <span className={`text-xs font-semibold uppercase ${SEVERITY_STYLE[row.severity]}`}>{row.severity}</span>
                  <span className="text-light-200 text-xs">{LOG_CATEGORY_LABELS[row.category]}</span>
                  <span>{row.summary}</span>
                  {row.source === "client" && <span className="text-light-200 text-xs">(from browser)</span>}
                </summary>
                <dl className="text-light-100 mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                  <dt className="text-light-200">Who</dt><dd>{row.actorName ? `${row.actorName} (${row.actorEmail}, ${row.actorRole})` : "Visitor / system"}</dd>
                  <dt className="text-light-200">Action</dt><dd className="font-mono">{row.action}</dd>
                  {row.target && <><dt className="text-light-200">Target</dt><dd>{row.target.type}: {row.target.label ?? row.target.id}</dd></>}
                  <dt className="text-light-200">From</dt><dd>{[row.ip, row.country].filter(Boolean).join(" · ") || "-"} {row.userAgent && <span className="text-light-200">· {row.userAgent.slice(0, 80)}</span>}</dd>
                  {row.snapshotHash && <><dt className="text-light-200">Approved content fingerprint</dt><dd className="font-mono break-all">{row.snapshotHash}</dd></>}
                  {row.details && <><dt className="text-light-200">Details</dt><dd className="font-mono break-all">{JSON.stringify(row.details)}</dd></>}
                </dl>
              </details>
            ))}
          </section>
        ))
      )}

      {data.pages > 1 && (
        <nav className="flex items-center gap-4 text-sm" aria-label="Pages">
          {filters.page > 1 && <Link href={href(filters, { page: filters.page - 1 })} className="hover:underline">&larr; Newer</Link>}
          <span className="text-light-200">Page {filters.page} of {data.pages} ({PAGE_SIZE} per page)</span>
          {filters.page < data.pages && <Link href={href(filters, { page: filters.page + 1 })} className="hover:underline">Older &rarr;</Link>}
        </nav>
      )}
    </>
  )
}
