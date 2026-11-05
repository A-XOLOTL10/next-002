import Link from "next/link"
import { notFound } from "next/navigation"
import { getEventBookings } from "@/lib/admin-data"
import AdminNav from "@/components/admin/AdminNav"
import CancelBookingButton from "@/components/admin/CancelBookingButton"
import DeleteEventButton from "@/components/admin/DeleteEventButton"

const formatBookedAt = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC"

// Waits for its data before sending anything (instant = false), so a missing event is a real
// 404 decided before the response starts, instead of a "not found" thrown mid-stream (which
// makes React fall back to client rendering and log error #419).
export const instant = false

export default function AdminEventBookingsPage({ params }: PageProps<"/host/console/events/[slug]">) {
  return (
    <>
      <AdminNav />
      <BookingsTable params={params} />
    </>
  )
}

async function BookingsTable({ params }: Pick<PageProps<"/host/console/events/[slug]">, "params">) {
  const { slug } = await params

  // Signed-in admins only (checked in lib/admin-data.ts).
  const data = await getEventBookings(slug)
  if (!data) notFound()

  const { event, bookings } = data
  const confirmed = bookings.filter((b) => b.status === "confirmed").length
  const pending = bookings.length - confirmed

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">{event.title}</h1>
          <p className="text-light-100">
            {event.date} &middot; {event.location} &middot; {confirmed} confirmed, {pending} pending
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link href={`/events/${slug}`} className="hover:underline">View public page</Link>
            <Link href={`/host/console/events/${slug}/edit`} className="hover:underline">Edit event</Link>
            <DeleteEventButton slug={slug} title={event.title} />
          </div>
        </div>

        {bookings.length > 0 && (
          // A plain link: the browser downloads the file the route returns.
          <a
            href={`/api/admin/events/${slug}/bookings`}
            className="bg-primary hover:bg-primary/90 rounded-[6px] px-4 py-2 text-sm font-semibold text-black"
          >
            Export CSV
          </a>
        )}
      </div>

      {bookings.length === 0 ? (
        <p>No bookings yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-dark-200 border-b">
              <tr>
                <th className="py-3 pr-4">#</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Ticket ID</th>
                <th className="py-3 pr-4">Booked</th>
                <th className="py-3 pr-4">Checked in</th>
                <th className="py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking, index) => (
                <tr key={booking._id} className="border-dark-200 border-b">
                  <td className="py-3 pr-4">{index + 1}</td>
                  <td className="py-3 pr-4">{booking.email}</td>
                  <td className="py-3 pr-4">
                    {booking.status === "confirmed" ? (
                      <span className="text-green-400">Confirmed</span>
                    ) : (
                      <span className="text-light-200" title="Waiting for the visitor to click the link in their email">Pending</span>
                    )}
                  </td>
                  {/* The ticket only becomes valid once the visitor confirms their email. */}
                  <td className="py-3 pr-4 font-mono">{booking.status === "confirmed" ? booking.ticketId : "—"}</td>
                  <td className="py-3 pr-4">{formatBookedAt(booking.bookedAt)}</td>
                  <td className="py-3 pr-4">{booking.checkedInAt ? formatBookedAt(booking.checkedInAt) : "—"}</td>
                  <td className="py-3 text-right">
                    <CancelBookingButton bookingId={booking._id} email={booking.email} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
