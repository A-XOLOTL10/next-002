import { Suspense } from "react"
import Link from "next/link"
import { getDraftCount, getEventsWithBookingCounts, type AdminEventSummary } from "@/lib/admin-data"
import { hasEnded, isHiddenFromVisitors } from "@/lib/utils"
import DeleteEventButton from "@/components/admin/DeleteEventButton"
import AdminNav from "@/components/admin/AdminNav"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

// The heading renders instantly; the table reads the session cookie (request-time
// data), so it streams in behind <Suspense>.
export default function AdminDashboardPage() {
  return (
    <>
      <AdminNav />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Manage Events</h1>
        <div className="flex flex-wrap gap-3">
          <Link href="/host/console/import" className="border-dark-200 rounded-[6px] border px-4 py-2 font-semibold hover:underline">AI Import</Link>
          <Link href="/host/console/events/new" className="admin-button">+ Create event</Link>
        </div>
      </div>

      <Suspense fallback={<p>Loading events...</p>}>
        <EventsTable />
      </Suspense>
    </>
  )
}

/** Where an event stands from a visitor's point of view. */
function visibility(event: AdminEventSummary): { label: string; style: string } {
  if (isHiddenFromVisitors(event.hideAt)) return { label: "Hidden from visitors", style: "text-light-200" }
  if (hasEnded(event.endsAt)) return { label: "Ended today", style: "text-amber-400" }
  return { label: "Live", style: "text-green-400" }
}

async function EventsTable() {
  // Signed-in admins only (checked in lib/admin-data.ts). This session check also calls connection(),
  // so everything below runs at request time and can safely read the current time.
  const [events, draftCount] = await Promise.all([getEventsWithBookingCounts(), getDraftCount()])

  return (
    <>
      {draftCount > 0 && (
        <p className="notice">
          {draftCount} {draftCount === 1 ? "draft is" : "drafts are"} waiting for review.{" "}
          <Link href="/host/console/drafts" className="font-semibold underline">Preview and publish</Link>
        </p>
      )}

      {events.length === 0 ? (
        <p>
          No published events yet. <Link href="/host/console/events/new" className="underline">Create one</Link>, or run{" "}
          <code className="font-mono">npm run seed</code> to add sample events.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-dark-200 border-b">
              <tr>
                <th className="py-3 pr-4">Event</th>
                <th className="py-3 pr-4">Date</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4 text-right" title="Visitors who confirmed via the email link">Confirmed</th>
                <th className="py-3 pr-4 text-right" title="Waiting for the visitor to click the email link">Pending</th>
                <th className="py-3 pr-4 text-right" title="Tickets scanned at the door">Checked in</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const { label, style } = visibility(event)
                return (
                  <tr key={event.slug} className="border-dark-200 border-b align-top">
                    <td className="py-3 pr-4">
                      <Link href={`/host/console/drafts/${event.slug}`} className="hover:underline">{event.title}</Link>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{event.date}</td>
                    <td className={`py-3 pr-4 whitespace-nowrap ${style}`}>{label}</td>
                    <td className="py-3 pr-4 text-right">{event.confirmedCount}</td>
                    <td className="py-3 pr-4 text-right">{event.pendingCount}</td>
                    <td className="py-3 pr-4 text-right">{event.checkedInCount}</td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-4">
                        <Link href={`/host/console/events/${event.slug}`} className="hover:underline">Bookings</Link>
                        <Link href={`/host/console/events/${event.slug}/edit`} className="hover:underline">Edit</Link>
                        <DeleteEventButton slug={event.slug} title={event.title} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
