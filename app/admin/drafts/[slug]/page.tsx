import Link from "next/link"
import { notFound } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import DeleteEventButton from "@/components/admin/DeleteEventButton"
import PublishPanel from "@/components/admin/PublishPanel"
import EventView from "@/components/EventView"
import { getEventPreview } from "@/lib/admin-data"
import { hasEnded } from "@/lib/utils"

// Shows an event exactly as visitors will see it (same component as the public page).
// Waits for its data before sending anything (instant = false), so a missing event is a real
// 404 decided before the response starts, instead of a "not found" thrown mid-stream (which
// makes React fall back to client rendering and log error #419).
export const instant = false

export default function EventPreviewPage({ params }: PageProps<"/admin/drafts/[slug]">) {
  return (
    <>
      <AdminNav />
      <Preview params={params} />
    </>
  )
}

async function Preview({ params }: Pick<PageProps<"/admin/drafts/[slug]">, "params">) {
  const { slug } = await params

  // Redirects to /admin/login if not signed in.
  const event = await getEventPreview(slug)
  if (!event) notFound()

  const isDraft = event.status === "draft"
  const missing = Object.keys(event.missing)
  const ended = hasEnded(event.endsAt)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold">
            {isDraft ? "Draft preview: visitors can't see this yet" : "Published: this is what visitors see"}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/admin/events/${event.slug}/edit`} className="hover:underline">Edit</Link>
            {!isDraft && <Link href={`/admin/events/${event.slug}`} className="hover:underline">Bookings</Link>}
            <DeleteEventButton slug={event.slug} title={event.title} />
          </div>
        </div>
      </div>

      {event.importNotes.length > 0 && (
        <div className="notice flex flex-col gap-1">
          <p className="font-semibold">Check these before publishing:</p>
          {event.importNotes.map((note) => <p key={note}>{note}</p>)}
        </div>
      )}

      <section id="event">
        <EventView
          event={event}
          endedAt={ended && event.endsAt ? new Date(event.endsAt) : undefined}
          aside={
            isDraft ? (
              <div className="flex flex-col gap-4">
                {missing.length > 0 ? (
                  <p className="notice">
                    Add these before publishing: <strong>{missing.join(", ")}</strong>.{" "}
                    <Link href={`/admin/events/${event.slug}/edit`} className="underline">Edit</Link>
                  </p>
                ) : ended ? (
                  <p className="notice">This event has already ended, so it can&apos;t be published.</p>
                ) : (
                  <PublishPanel slugs={[event.slug]} label="Publish this event" />
                )}
              </div>
            ) : (
              <div className="signup-card">
                <h2>Book Your Spot</h2>
                <p className="text-sm">The booking form appears here for visitors.</p>
              </div>
            )
          }
        />
      </section>
    </>
  )
}
