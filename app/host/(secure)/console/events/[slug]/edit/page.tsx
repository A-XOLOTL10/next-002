import Link from "next/link"
import { notFound } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import EventForm from "@/components/admin/EventForm"
import { updateEventAction } from "@/lib/actions/admin.actions"
import { getEventForEdit } from "@/lib/admin-data"

// Waits for its data before sending anything (instant = false), so a missing event is a real
// 404 decided before the response starts, instead of a "not found" thrown mid-stream (which
// makes React fall back to client rendering and log error #419).
export const instant = false

export default function EditEventPage({ params }: PageProps<"/host/console/events/[slug]/edit">) {
  return (
    <>
      <AdminNav />
      <EditForm params={params} />
    </>
  )
}

async function EditForm({ params }: Pick<PageProps<"/host/console/events/[slug]/edit">, "params">) {
  const { slug } = await params

  // Signed-in admins only (checked in lib/admin-data.ts).
  const event = await getEventForEdit(slug)
  if (!event) notFound()

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Edit Event</h1>
        <p className="text-light-200 text-sm">
          {event.status === "draft"
            ? "Drafts can be saved with details missing; everything is needed before publishing."
            : "Existing bookings are kept, and the event's web address stays the same."}{" "}
          <Link href={`/host/console/drafts/${slug}`} className="underline">Back to preview</Link>
        </p>
      </div>
      {/* Bound to the current slug; the action redirects to the (possibly new) slug when saved. */}
      <EventForm action={updateEventAction.bind(null, slug)} initial={event} submitLabel="Save changes" />
    </>
  )
}
