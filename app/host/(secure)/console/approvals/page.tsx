import Link from "next/link"
import AdminNav from "@/components/admin/AdminNav"
import ConfirmAction from "@/components/admin/ConfirmAction"
import { requireAdmin } from "@/lib/auth"
import { getHostsAwaitingReview } from "@/lib/host.service"
import { getEventsAwaitingReview, getOpenReports, getPendingRevisions } from "@/lib/host-events.service"
import { minutesWaiting } from "@/lib/business-hours"
import { resolveReportAction } from "@/lib/actions/console.actions"
import { REPORT_REASON_LABELS } from "@/database/report.constants"
import { VERIFICATION_TARGET_MINUTES } from "@/database/user.constants"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const DONE: Record<string, string> = { event: "Event decision saved; the host has been emailed.", revision: "Change decision saved; the host has been emailed." }

/** "12 min": amber from 5 minutes, red past the 10-minute promise. */
function Waiting({ since }: { since?: string }) {
  const minutes = minutesWaiting(since)
  const tone = minutes >= VERIFICATION_TARGET_MINUTES ? "text-red-400" : minutes >= 5 ? "text-amber-400" : "text-green-400"
  const label = minutes < 60 ? `${minutes} min` : minutes < 1440 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${Math.floor(minutes / 1440)} days`
  return <span className={`text-sm font-semibold ${tone}`}>waiting {label}</span>
}

// Everything waiting for an admin, oldest first: hosts to verify, events to review, changes to
// live events, and visitor reports. Each item opens a page where every decision is confirmed.
export default async function ApprovalsPage({ searchParams }: PageProps<"/host/console/approvals">) {
  await requireAdmin()
  const [hosts, events, revisions, reports, params] = await Promise.all([getHostsAwaitingReview(), getEventsAwaitingReview(), getPendingRevisions(), getOpenReports(), searchParams])
  const done = typeof params.done === "string" ? DONE[params.done] : undefined

  return (
    <>
      <AdminNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Approvals</h1>
          <p className="text-light-100 text-sm">Hosts are promised about {VERIFICATION_TARGET_MINUTES} minutes during working hours. Oldest first.</p>
        </div>
        <Link href="/host/console/hosts" className="text-sm hover:underline">All hosts &rarr;</Link>
      </div>
      {done && <p className="rounded-md border border-green-400/40 px-4 py-3 text-sm text-green-400" role="status">{done}</p>}

      <Queue title="Hosts to verify" count={hosts.length} empty="No hosts waiting.">
        {hosts.map((h) => (
          <Row key={h._id} href={`/host/console/hosts/${h._id}`} title={h.company ?? h.name} meta={`${h.name} · ${h.email} · ${h.accountType}${h.status === "appeal_pending" ? " · responded to a denial" : ""}`}>
            <span className="text-light-200 text-xs">{h.organizations.map((o) => `${o.name}: ${o.status}`).join(" · ")}</span>
            <Waiting since={h.submittedAt} />
          </Row>
        ))}
      </Queue>

      <Queue title="Events to review" count={events.length} empty="No events waiting.">
        {events.map((e) => (
          <Row key={e.slug} href={`/host/console/reviews/${e.slug}`} title={e.title} meta={`${e.host} · ${[e.date, e.location].filter(Boolean).join(" · ")}`}>
            <span className="text-light-200 text-xs">Sponsors: {e.sponsors.join(", ") || "none"}</span>
            <Waiting since={e.submittedAt} />
          </Row>
        ))}
      </Queue>

      <Queue title="Changes to live events" count={revisions.length} empty="No changes waiting.">
        {revisions.map((r) => (
          <Row key={r._id} href={r.slug ? `/host/console/reviews/${r.slug}` : "#"} title={r.title} meta={`Changes: ${r.fields.join(", ")}`}>
            <Waiting since={r.createdAt} />
          </Row>
        ))}
      </Queue>

      <Queue title="Reports from visitors" count={reports.length} empty="No open reports.">
        {reports.map((r) => (
          <div key={r._id} className="bg-dark-100 border-dark-200 flex flex-col gap-2 rounded-[10px] border p-4">
            <p className="font-semibold">
              {r.event ? <Link href={`/events/${r.event.slug}`} className="hover:underline">{r.event.title}</Link> : "Deleted event"}{" "}
              <span className="text-light-200 text-sm font-normal">({r.event?.status})</span>
            </p>
            <p className="text-sm text-amber-400">{REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS] ?? r.reason}</p>
            {r.details && <p className="text-light-100 text-sm">&ldquo;{r.details}&rdquo;</p>}
            {r.contactEmail && <p className="text-light-200 text-xs">Reporter: {r.contactEmail}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Waiting since={r.createdAt} />
              <ConfirmAction action={resolveReportAction.bind(null, r._id, "dismiss")} label="Dismiss" title="Dismiss this report?" description="The event stays live. Your note is saved in the activity log." confirmLabel="Dismiss" reason={{ label: "Why is this fine?", required: true }} />
              {r.event?.status === "published" && (
                <ConfirmAction
                  action={resolveReportAction.bind(null, r._id, "cancel_event")}
                  label="Take the event down"
                  tone="danger"
                  title="Cancel this event?"
                  description="The event is cancelled immediately and everyone who booked is emailed. This can't be undone."
                  confirmLabel="Cancel event"
                  reason={{ label: "What did you find?", required: true }}
                />
              )}
            </div>
          </div>
        ))}
      </Queue>
    </>
  )
}

const Queue = ({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-xl font-semibold">{title} <span className="text-light-200 text-base">({count})</span></h2>
    {count === 0 ? <p className="text-light-200 text-sm">{empty}</p> : <div className="grid gap-3">{children}</div>}
  </section>
)

const Row = ({ href, title, meta, children }: { href: string; title: string; meta: string; children?: React.ReactNode }) => (
  <Link href={href} className="bg-dark-100 border-dark-200 hover:border-primary flex flex-col gap-1 rounded-[10px] border p-4 transition-colors">
    <span className="font-semibold">{title}</span>
    <span className="text-light-200 text-sm">{meta}</span>
    {children}
  </Link>
)
