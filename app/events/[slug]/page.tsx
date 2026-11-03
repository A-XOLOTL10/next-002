import { notFound } from "next/navigation"
import { connection } from "next/server"
import { cacheLife, cacheTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import BookEvents from "@/components/BookEvents"
import EventList from "@/components/EventList"
import EventView from "@/components/EventView"
import { getEventBySlug, getSimilarEventsBySlug } from "@/lib/actions/events.actions"
import { hasEnded, isHiddenFromVisitors } from "@/lib/utils"
import { bookingsTag } from "@/lib/cache-tags"

// This page waits for its data before sending anything (instant = false) rather than streaming
// it in behind <Suspense>. Whether the event exists has to be known before the response starts:
// a "not found" discovered mid-stream can't change the status code (so search engines would see
// a 200) and makes React fall back to client rendering (console error #419). The data reads are
// cached, so the wait is short.
export const instant = false

// Caching on this page:
// - The page itself is NOT cached: it awaits `params`, which is request-time data, and whether
//   an event has ended changes by the minute.
// - Every database read IS cached (getEventBySlug, getSimilarEventsBySlug, and
//   getBookingCount below), so repeat visits to an event skip MongoDB.

// Why "use cache": the count is shown on every visit but only changes when someone
// confirms a booking. confirmBooking clears this tag with updateTag(), so the booker sees the
// new count immediately. "minutes" bounds staleness for other visitors on
// serverless hosts, where each instance has its own in-memory cache.
async function getBookingCount(eventId: string) {
  "use cache"
  cacheLife("minutes")
  cacheTag(bookingsTag(eventId))

  await connectDB()
  // Only confirmed bookings count: pending ones haven't verified their email yet.
  return Booking.countDocuments({ eventId, status: "confirmed" })
}

export default async function EventDetailsPage({ params }: PageProps<"/events/[slug]">) {
  // Everything below depends on the current time, so it always runs at request time.
  await connection()

  const { slug } = await params
  const event = await getEventBySlug(slug)

  // Drafts, and events past the end of their last day, don't exist as far as visitors know.
  if (!event || isHiddenFromVisitors(event.hideAt)) notFound()

  const ended = hasEnded(event.endsAt)
  const bookings = await getBookingCount(event._id)

  // Similar events are optional: if the query fails, render the page without them.
  // Caught here, outside the cache, so the failure itself is never cached.
  const similarEvents = await getSimilarEventsBySlug(slug).catch((e: unknown) => {
    console.error("Failed to load similar events:", e)
    return []
  })

  return (
    <section id="event">
      <EventView
        event={event}
        endedAt={ended ? event.endsAt : undefined}
        aside={
          <div className="signup-card">
            <h2>{ended ? "Bookings Closed" : "Book Your Spot"}</h2>

            {ended ? (
              <p className="text-sm">This event has ended, so bookings are closed.</p>
            ) : (
              <>
                <p className="text-sm">
                  {bookings > 0
                    ? `Join ${bookings} ${bookings === 1 ? "person who has" : "people who have"} already booked their spot!`
                    : "Be the first to book your spot!"}
                </p>
                <BookEvents eventId={event._id} />
              </>
            )}
          </div>
        }
      >
        {similarEvents.length > 0 && (
          <div className="flex w-full flex-col gap-4 pt-20">
            <h2>Similar Events</h2>
            <EventList events={similarEvents} emptyText="" />
          </div>
        )}
      </EventView>
    </section>
  )
}
