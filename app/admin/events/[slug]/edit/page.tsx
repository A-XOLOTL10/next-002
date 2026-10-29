import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import EventForm from "@/components/admin/EventForm"
import { updateEventAction } from "@/lib/actions/admin.actions"
import { getEventForEdit } from "@/lib/admin-data"

export default function EditEventPage({ params }: PageProps<"/admin/events/[slug]/edit">) {
  return (
    <>
      <AdminNav />

      {/* params and the session cookie are request-time data, so the form streams in. */}
      <Suspense fallback={<p>Loading event...</p>}>
        <EditForm params={params} />
      </Suspense>
    </>
  )
}

async function EditForm({ params }: Pick<PageProps<"/admin/events/[slug]/edit">, "params">) {
  const { slug } = await params

  // Redirects to /admin/login if not signed in.
  const event = await getEventForEdit(slug)
  if (!event) notFound()

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Edit Event</h1>
        <p className="text-light-200 text-sm">
          Changing the title also changes the event&apos;s URL. Existing bookings are kept.{" "}
          <Link href={`/admin/events/${slug}`} className="underline">Back to bookings</Link>
        </p>
      </div>
      {/* Bound to the current slug; the action redirects to the (possibly new) slug when saved. */}
      <EventForm action={updateEventAction.bind(null, slug)} initial={event} submitLabel="Save changes" />
    </>
  )
}
