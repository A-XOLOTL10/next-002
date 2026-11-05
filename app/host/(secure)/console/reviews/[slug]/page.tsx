import Link from "next/link"
import { notFound } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import ConfirmAction from "@/components/admin/ConfirmAction"
import EventView from "@/components/EventView"
import { requireAdmin } from "@/lib/auth"
import { getHostEventForReview } from "@/lib/host-events.service"
import { cancelEventAsAdminAction, decideEventAction, decideRevisionAction } from "@/lib/actions/console.actions"
import { AUDIENCE_AGE_LABELS, EVENT_STATUS_LABELS } from "@/database/event.constants"

export const instant = false // a missing event is a real 404, decided before the response starts

const ORG_STYLE: Record<string, string> = { confirmed: "text-green-400", denied: "text-red-400", unreachable: "text-amber-400", pending: "text-light-200", missing: "text-red-400" }
const show = (value: unknown): string => (Array.isArray(value) ? value.join(" | ") : value && typeof value === "object" ? Object.values(value).join(", ") : String(value ?? "-"))

// Reviewing a host's event: exactly what visitors would see, plus everything behind it: the host,
// each sponsor's check result, the signed letter, safety details, and any proposed changes.
export default async function EventReviewPage({ params }: PageProps<"/host/console/reviews/[slug]">) {
  const admin = await requireAdmin()
  const { slug } = await params
  const data = await getHostEventForReview(slug)
  if (!data) notFound()
  const { event, owner, profile, sponsors, revision, missing } = data
  const own = event.ownerId === admin.user.id
  const inReview = event.status === "in_review"
  const sponsorsOk = sponsors.length > 0 && sponsors.every((s) => s.status === "confirmed")

  return (
    <>
      <AdminNav />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{event.title}</h1>
        <p className="text-light-100 text-sm">
          {EVENT_STATUS_LABELS[event.status]} · by {owner?.name} ({owner?.email}) ·{" "}
          {profile && <Link href={`/host/console/hosts/${profile._id}`} className="underline">host verification: {profile.status.replace("_", " ")}</Link>}
        </p>
      </div>
      {own && <p className="notice">This is your own event, so another admin has to review it.</p>}
      {inReview && missing.length > 0 && <p className="notice">Missing before it can go live: {missing.join(", ")}.</p>}

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="bg-dark-100 border-dark-200 flex flex-col gap-1 rounded-[10px] border p-4 text-sm">
          <h2 className="mb-1 text-base font-semibold">Sponsors and companies</h2>
          {sponsors.length === 0 && <p className="text-red-400">None chosen</p>}
          {sponsors.map((s) => (
            <p key={s.name}>
              {s.name}: <span className={ORG_STYLE[s.status]}>{s.status}</span>
              {s.contactPhone && <span className="text-light-200"> · {s.contactName} · <a href={`tel:${s.contactPhone}`} className="underline">{s.contactPhone}</a></span>}
            </p>
          ))}
          {!sponsorsOk && profile && <Link href={`/host/console/hosts/${profile._id}`} className="text-primary mt-1 underline">Record sponsor checks on the host&apos;s page</Link>}
        </div>
        <div className="bg-dark-100 border-dark-200 flex flex-col gap-1 rounded-[10px] border p-4 text-sm">
          <h2 className="mb-1 text-base font-semibold">Contact and safety</h2>
          <p>Event contact: {event.hostContact ? `${event.hostContact.name} · ${event.hostContact.phone} · ${event.hostContact.email}` : <span className="text-red-400">missing</span>}</p>
          <p>Audience: {event.audienceAge ? AUDIENCE_AGE_LABELS[event.audienceAge] : <span className="text-red-400">not set</span>}</p>
          {event.audienceAge && event.audienceAge !== "adults" && (
            <p className="text-amber-400">Under-18s may attend. Safeguarding contact: {event.safeguardingContact ? `${event.safeguardingContact.name} · ${event.safeguardingContact.phone}` : "missing"}. Confirm the venue is public.</p>
          )}
          <p>
            Signed letter:{" "}
            {event.authorizationLetterId ? <a href={`/api/console/files/${event.authorizationLetterId}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">Open</a> : <span className="text-red-400">missing</span>}
          </p>
        </div>
      </section>

      {revision && (
        <section className="flex flex-col gap-3 rounded-[10px] border border-amber-400/40 p-4">
          <h2 className="text-xl font-semibold">Proposed changes to the live event</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-dark-200 border-b"><tr><th className="py-2 pr-4">Field</th><th className="py-2 pr-4">Now</th><th className="py-2">Proposed</th></tr></thead>
              <tbody>
                {Object.entries(revision.changes).map(([key, value]) => (
                  <tr key={key} className="border-dark-200 border-b align-top">
                    <td className="py-2 pr-4 font-semibold">{key}</td>
                    <td className="text-light-200 py-2 pr-4">{show((event as Record<string, unknown>)[key])}</td>
                    <td className="py-2 text-amber-300">{show(value)}</td>
                  </tr>
                ))}
                {revision.images && <tr><td className="py-2 pr-4 font-semibold">images</td><td className="text-light-200 py-2 pr-4">{event.images.length} image(s)</td><td className="py-2 text-amber-300">{revision.images.length} image(s), see below</td></tr>}
              </tbody>
            </table>
          </div>
          {revision.images && (
            <div className="flex flex-wrap gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- small review thumbnails */}
              {revision.images.map((src) => <img key={src} src={src} alt="Proposed image" className="h-[90px] w-[160px] rounded object-cover" loading="lazy" />)}
            </div>
          )}
          {!own && (
            <div className="flex flex-wrap gap-3">
              <ConfirmAction action={decideRevisionAction.bind(null, revision._id, true)} label="Approve changes" pin title="Approve these changes?" description="They're applied to the live event straight away. If the date, time or place changes, everyone who booked is emailed." confirmLabel="Approve and apply" />
              <ConfirmAction action={decideRevisionAction.bind(null, revision._id, false)} label="Reject changes" tone="danger" title="Reject these changes?" description="The live event stays as it is. The host is emailed your note." confirmLabel="Reject" reason={{ label: "Note for the host", required: true }} />
            </div>
          )}
        </section>
      )}

      <section id="event" className="border-dark-200 rounded-[10px] border p-4">
        <p className="text-light-200 mb-4 text-sm">Preview: what visitors will see</p>
        <EventView
          event={event}
          aside={
            <div className="signup-card">
              <h2>Book Your Spot</h2>
              <p className="text-sm">The booking form appears here for visitors.</p>
            </div>
          }
        />
      </section>

      {!own && inReview && (
        <section className="flex flex-wrap gap-3 border-t border-dark-200 pt-6">
          <ConfirmAction
            action={decideEventAction.bind(null, event.slug, "approve")}
            label="Approve and publish"
            disabled={!sponsorsOk || missing.length > 0}
            pin
            title="Publish this event?"
            description="It becomes visible to all visitors immediately and bookings open. You've checked the host, every sponsor, the signed letter and the venue."
            confirmLabel="Publish"
          />
          <ConfirmAction action={decideEventAction.bind(null, event.slug, "changes_requested")} label="Ask for changes" buttonClassName="border-dark-200 cursor-pointer rounded-[6px] border px-3 py-1.5 text-sm font-semibold" title="Send back for changes?" description="The host is emailed your note and can edit and resend the event." confirmLabel="Send back" reason={{ label: "What needs to change? (sent to the host)", required: true }} />
          <ConfirmAction action={decideEventAction.bind(null, event.slug, "rejected")} label="Reject" tone="danger" title="Reject this event?" description="It won't be published and can't be resubmitted. The host is emailed your reason." confirmLabel="Reject" reason={{ label: "Reason (sent to the host)", required: true }} />
        </section>
      )}
      {event.status === "published" && (
        <section className="border-t border-dark-200 pt-6">
          <ConfirmAction action={cancelEventAsAdminAction.bind(null, event.slug)} label="Cancel this live event" tone="danger" title="Cancel this event?" description="It's taken down immediately and everyone who booked is emailed with your reason. This can't be undone." confirmLabel="Cancel event" reason={{ label: "Reason (sent to everyone who booked)", required: true }} typeToConfirm="CANCEL" />
        </section>
      )}
    </>
  )
}
