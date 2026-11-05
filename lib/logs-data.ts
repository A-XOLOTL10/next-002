import "server-only"
import type { QueryFilter } from "mongoose"
import connectDB from "@/lib/mongodb"
import AuditLog, { ActivityDay, LOG_CATEGORIES, LOG_SEVERITIES, type IAuditLog, type LogCategory, type LogSeverity } from "@/database/audit-log.model"
import User from "@/database/user.model"

// Reads for the activity log page and its CSV export. Filters come from the page address
// (?category=events&range=7d&...), so any filtered view can be bookmarked or shared.

export const RANGES = { today: "Today", yesterday: "Yesterday", "7d": "Last 7 days", "30d": "Last 30 days", month: "This month", custom: "Custom" } as const
export type RangeKey = keyof typeof RANGES

export type LogFilters = {
  category?: LogCategory
  severity?: LogSeverity
  range: RangeKey
  from?: string // YYYY-MM-DD, with range "custom"
  to?: string
  actor?: string
  q?: string
  page: number
}

export const PAGE_SIZE = 50
const DAY = 24 * 60 * 60 * 1000

/** Reads filters from the URL, ignoring anything unexpected. */
export function parseLogFilters(params: Record<string, string | string[] | undefined>): LogFilters {
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined)
  const date = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)
  const range = (one("range") ?? "7d") as RangeKey
  return {
    category: LOG_CATEGORIES.find((c) => c === one("category")),
    severity: LOG_SEVERITIES.find((s) => s === one("severity")),
    range: range in RANGES ? range : "7d",
    from: date(one("from")),
    to: date(one("to")),
    actor: /^[a-f\d]{24}$/i.test(one("actor") ?? "") ? one("actor") : undefined,
    q: one("q")?.trim().slice(0, 100) || undefined,
    page: Math.max(1, Math.min(1000, Number(one("page")) || 1)),
  }
}

/** The date window for a range, in Lagos time (where the team works). */
export function rangeWindow(filters: Pick<LogFilters, "range" | "from" | "to">, now = new Date()): { start: Date; end: Date } {
  const lagosMidnight = (d: Date) => {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(d) // YYYY-MM-DD
    return new Date(`${day}T00:00:00+01:00`)
  }
  const today = lagosMidnight(now)
  switch (filters.range) {
    case "today": return { start: today, end: now }
    case "yesterday": return { start: new Date(today.getTime() - DAY), end: today }
    case "30d": return { start: new Date(today.getTime() - 29 * DAY), end: now }
    case "month": return { start: new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now).slice(0, 8)}01T00:00:00+01:00`), end: now }
    case "custom": {
      const start = filters.from ? new Date(`${filters.from}T00:00:00+01:00`) : new Date(today.getTime() - 6 * DAY)
      const end = filters.to ? new Date(new Date(`${filters.to}T00:00:00+01:00`).getTime() + DAY) : now
      return { start, end }
    }
    default: return { start: new Date(today.getTime() - 6 * DAY), end: now }
  }
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function buildQuery(filters: LogFilters): QueryFilter<IAuditLog> {
  const { start, end } = rangeWindow(filters)
  const query: QueryFilter<IAuditLog> = { at: { $gte: start, $lt: end } }
  if (filters.category) query.category = filters.category
  if (filters.severity) query.severity = filters.severity
  if (filters.actor) query.actorId = filters.actor
  if (filters.q) {
    const pattern = new RegExp(escapeRegex(filters.q), "i")
    query.$or = [{ summary: pattern }, { actorEmail: pattern }, { "target.label": pattern }, { ip: pattern }, { action: pattern }]
  }
  return query
}

export type LogRow = {
  id: string
  at: string
  actorName?: string
  actorEmail?: string
  actorRole?: string
  category: LogCategory
  action: string
  severity: LogSeverity
  summary: string
  target?: { type: string; id?: string; label?: string }
  details?: Record<string, unknown>
  snapshotHash?: string
  ip?: string
  country?: string
  userAgent?: string
  source: "server" | "client"
}

const toRow = (e: IAuditLog): LogRow => ({
  id: e._id.toString(),
  at: e.at.toISOString(),
  actorName: e.actorName,
  actorEmail: e.actorEmail,
  actorRole: e.actorRole,
  category: e.category,
  action: e.action,
  severity: e.severity,
  summary: e.summary,
  target: e.target,
  details: e.details,
  snapshotHash: e.snapshotHash,
  ip: e.ip,
  country: e.country,
  userAgent: e.userAgent,
  source: e.source,
})

/** One page of entries, newest first, plus the summary for the selected dates. */
export async function queryLogs(filters: LogFilters) {
  await connectDB()
  const query = buildQuery(filters)
  const { start, end } = rangeWindow(filters)
  const dayFrom = start.toISOString().slice(0, 10)
  const dayTo = end.toISOString().slice(0, 10)

  const [entries, total, byCategory, bySeverity, activeTime, actors] = await Promise.all([
    AuditLog.find(query).sort({ at: -1 }).skip((filters.page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
    AuditLog.countDocuments(query),
    AuditLog.aggregate<{ _id: LogCategory; count: number }>([{ $match: { ...query, category: { $exists: true } } }, { $group: { _id: "$category", count: { $sum: 1 } } }]),
    AuditLog.aggregate<{ _id: LogSeverity; count: number }>([{ $match: query }, { $group: { _id: "$severity", count: { $sum: 1 } } }]),
    ActivityDay.aggregate<{ _id: unknown; seconds: number }>([{ $match: { day: { $gte: dayFrom, $lte: dayTo } } }, { $group: { _id: "$userId", seconds: { $sum: "$activeSeconds" } } }]),
    User.find({ role: { $in: ["super_admin", "supra_admin"] } }).select("name email").lean(),
  ])

  return {
    entries: entries.map(toRow),
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    byCategory: Object.fromEntries(byCategory.map((c) => [c._id, c.count])) as Partial<Record<LogCategory, number>>,
    bySeverity: Object.fromEntries(bySeverity.map((s) => [s._id, s.count])) as Partial<Record<LogSeverity, number>>,
    activeTime: activeTime
      .map((t) => ({ name: actors.find((a) => a._id.toString() === String(t._id))?.name ?? "Former admin", minutes: Math.round(t.seconds / 60) }))
      .sort((a, b) => b.minutes - a.minutes),
    actors: actors.map((a) => ({ id: a._id.toString(), name: a.name, email: a.email })),
    window: { start: start.toISOString(), end: end.toISOString() },
  }
}

/** Up to 10,000 matching entries for the CSV export. */
export async function exportLogs(filters: LogFilters): Promise<LogRow[]> {
  await connectDB()
  const entries = await AuditLog.find(buildQuery(filters)).sort({ at: -1 }).limit(10_000).lean()
  return entries.map(toRow)
}
