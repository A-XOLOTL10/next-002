import "server-only"
import { createHash } from "node:crypto"
import { after } from "next/server"
import connectDB from "@/lib/mongodb"
import AuditLog, { type LogCategory, type LogSeverity } from "@/database/audit-log.model"
import { getRequestInfo } from "@/lib/request-info"

// Writes to the activity log (see database/audit-log.model.ts).
//
// Logging runs in after(): the response goes to the user first and the entry is saved right
// behind it, so a slow or failing log write can never block or break the action itself.
// Failures are reported to the server log instead.

export type Actor = { id: string; email: string; name: string; role: string; sessionId?: string }

export type LogEntry = {
  actor?: Actor | null
  category: LogCategory
  action: string
  severity?: LogSeverity
  summary: string
  target?: { type: string; id?: string; label?: string }
  details?: Record<string, unknown>
  snapshotHash?: string
}

async function write(entry: LogEntry, request: Awaited<ReturnType<typeof getRequestInfo>> | null): Promise<void> {
  try {
    await connectDB()
    await AuditLog.create({
      at: new Date(),
      actorId: entry.actor?.id,
      actorEmail: entry.actor?.email,
      actorName: entry.actor?.name,
      actorRole: entry.actor?.role,
      sessionId: entry.actor?.sessionId,
      category: entry.category,
      action: entry.action,
      severity: entry.severity ?? "info",
      summary: entry.summary.slice(0, 500),
      target: entry.target,
      details: entry.details,
      snapshotHash: entry.snapshotHash,
      ip: request?.ip,
      country: request?.country,
      userAgent: request?.userAgent,
      source: "server",
    })
  } catch (e) {
    console.error(`Activity log write failed (${entry.action}):`, e)
  }
}

/** Records one action. Never throws. */
export async function logAction(entry: LogEntry): Promise<void> {
  // Request details are read now, while the request is still available.
  const request = await getRequestInfo().catch(() => null)
  try {
    after(() => write(entry, request))
  } catch {
    // Outside a request (scripts), after() isn't available: write directly.
    await write(entry, request)
  }
}

/**
 * A fingerprint of exactly what was approved. Keys are sorted so the same content always gives
 * the same hash; stored on the record and in the log, it proves what an admin saw and approved.
 */
export function snapshotHash(value: unknown): string {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable)
    if (v && typeof v === "object" && !(v instanceof Date)) {
      if (typeof (v as { toHexString?: unknown }).toHexString === "function") return String(v) // ObjectId
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, val]) => [k, stable(val)]))
    }
    return v
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")
}
