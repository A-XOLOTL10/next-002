import { Suspense } from "react"
import Link from "next/link"
import { getEventsWithBookingCounts } from "@/lib/admin-data"
import { isPastEvent } from "@/lib/utils"
import DeleteEventButton from "@/components/admin/DeleteEventButton"
import AdminNav from "@/components/admin/AdminNav"

// The heading renders instantly; the table reads the session cookie (request-time
// data), so it streams in behind <Suspense>.
export default function AdminDashboardPage() {
  return (
    <>
      <AdminNav />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Manage Events</h1>
        <Link
          href="/admin/events/new"
          className="bg-primary hover:bg-primary/90 rounded-[6px] px-4 py-2 font-semibold text-black"
        >
          + Create event
        </Link>
      </div>

      <Suspense fallback={<p>Loading events...</p>}>
        <EventsTable />
      </Suspense>
    </>
  )
}

async function EventsTable() {
  // Redirects to /admin/login if not signed in.
  const events = await getEventsWithBookingCounts()

  if (events.length === 0) {
    return (
      <p>
        No events yet. <Link href="/admin/events/new" className="underline">Create the first one</Link>, or run{" "}
        <code className="font-mono">npm run seed</code> to add sample events.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-dark-200 border-b">
          <tr>
            <th className="py-3 pr-4">Event</th>
            <th className="py-3 pr-4">Date</th>
            <th className="py-3 pr-4">Location</th>
            <th className="py-3 pr-4 text-right" title="Visitors who confirmed via the email link">Confirmed</th>
            <th className="py-3 pr-4 text-right" title="Waiting for the visitor to click the email link">Pending</th>
            <th className="py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.slug} className="border-dark-200 border-b align-top">
              <td className="py-3 pr-4">
                <Link href={`/events/${event.slug}`} className="hover:underline">{event.title}</Link>
              </td>
              <td className="py-3 pr-4 whitespace-nowrap">
                <EventDate date={event.date} />
              </td>
              <td className="py-3 pr-4">{event.location}</td>
              <td className="py-3 pr-4 text-right">{event.confirmedCount}</td>
              <td className="py-3 pr-4 text-right">{event.pendingCount}</td>
              <td className="py-3">
                <div className="flex flex-wrap gap-4">
                  <Link href={`/admin/events/${event.slug}`} className="hover:underline">Bookings</Link>
                  <Link href={`/admin/events/${event.slug}/edit`} className="hover:underline">Edit</Link>
                  <DeleteEventButton slug={event.slug} title={event.title} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Marks events dated before today. Reading the date is safe here: this table only renders
 * after the session check, which calls connection(), so it never runs during prerendering.
 */
function EventDate({ date }: { date: string }) {
  return (
    <>
      {date}
      {isPastEvent(date) && <span className="text-light-200 ml-2">(ended)</span>}
    </>
  )
}
