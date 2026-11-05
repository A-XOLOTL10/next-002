import Link from "next/link"
import { notFound } from "next/navigation"
import HostNav from "@/components/host/HostNav"
import HostEventForm from "@/components/host/HostEventForm"
import ConfirmAction from "@/components/admin/ConfirmAction"
import { requireHost } from "@/lib/auth"
import { cancelHostEventAction, deleteHostDraftAction, saveHostEventAction } from "@/lib/actions/host.actions"
import { getHostEventForEdit } from "@/lib/host-events.service"
import { getHostFormContext } from "@/lib/host-form-data"
import { EVENT_STATUS_LABELS } from "@/database/event.constants"

// Waits for its data before sending anything (instant = false), so an event that isn't this
// host's is a real 404 decided before the response starts.
export const instant = false

export default async function EditHostEventPage({ params, searchParams }: PageProps<"/host/events/[slug]/edit">) {
  const session = await requireHost()
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const [event, context] = await Promise.all([getHostEventForEdit(session.user.id, slug), getHostFormContext(session.user.id, session.user)])
  if (!event) notFound()

  const live = event.status === "published"
  const locked = event.status === "in_review" || event.status === "cancelled" || event.status === "rejected"

  return (
    <>
      <HostNav />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">{live ? "Propose changes" : "Edit event"}</h1>
          <p className="text-light-100 text-sm">
            {event.title} · <strong>{EVENT_STATUS_LABELS[event.status]}</strong>
            {live && " · Changes go to our team first; visitors see the current version until they're approved. The title can't change once live."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {live && <Link href={`/events/${event.slug}`} className="text-sm hover:underline">View live page</Link>}
          {live && (
            <ConfirmAction
              action={cancelHostEventAction.bind(null, event.slug)}
              label="Cancel event"
              tone="danger"
              title="Cancel this event?"
              description="Bookings close immediately and everyone who booked gets an email that the event is cancelled, with your reason. This can't be undone."
              confirmLabel="Cancel event"
              reason={{ label: "Reason (sent to everyone who booked)", required: true }}
            />
          )}
          {(event.status === "draft" || event.status === "changes_requested" || event.status === "rejected") && (
            <ConfirmAction
              action={deleteHostDraftAction.bind(null, event.slug)}
              label="Delete draft"
              tone="danger"
              title="Delete this draft?"
              description="The draft and its images are deleted. This can't be undone."
              confirmLabel="Delete draft"
            />
          )}
        </div>
      </div>

      {query.saved === "1" && <p className="rounded-md border border-green-400/40 px-4 py-3 text-sm text-green-400" role="status">Draft saved.</p>}
      {event.reviewReason && event.status === "changes_requested" && <p className="notice">Our team asked for changes: {event.reviewReason}</p>}
      {event.pendingRevision && <p className="notice">You already have changes waiting for review. Sending new ones replaces them.</p>}

      {locked ? (
        <p className="notice">
          {event.status === "in_review" ? "This event is being reviewed, so it can't be edited right now." : "This event can't be edited any more."}{" "}
          <Link href="/host" className="underline">Back to your events</Link>
        </p>
      ) : (
        <HostEventForm
          action={saveHostEventAction.bind(null, event.slug)}
          initial={event}
          sponsors={context.sponsors}
          aiEnabled={context.aiEnabled}
          mode={live ? "live" : "draft"}
          defaultContact={context.defaultContact}
        />
      )}
    </>
  )
}
