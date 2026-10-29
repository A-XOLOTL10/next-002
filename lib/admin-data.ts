import "server-only"
import connectDB from "@/lib/mongodb"
import Event, { type EventMode } from "@/database/event.model"
import Booking, { type BookingStatus } from "@/database/booking.model"
import { requireAdmin } from "@/lib/auth"
import { toList } from "@/lib/utils"

// Admin-only reads. Each function checks the session itself, so admin data can't be
// reached by a page or route that forgets to check.
//
// Not cached ("use cache"): admins need live numbers, and these reads depend on the
// request's session cookie, which cached functions can't access.

export type AdminEventSummary = {
  slug: string
  title: string
  date: string
  location: string
  confirmedCount: number
  pendingCount: number
}

export type AdminBooking = {
  _id: string
  email: string
  ticketId: string
  status: BookingStatus
  bookedAt: string // ISO timestamp
}

/** Values for the edit form. Lists are already split into items. */
export type EventFormValues = {
  title: string
  description: string
  overview: string
  image: string
  venue: string
  location: string
  date: string
  time: string
  mode: EventMode
  audience: string
  organizer: string
  agenda: string[]
  tags: string[]
}

/** All events, newest first, with confirmed and pending booking counts. */
export async function getEventsWithBookingCounts(): Promise<AdminEventSummary[]> {
  await requireAdmin()
  await connectDB()

  const [events, counts] = await Promise.all([
    Event.find().sort({ createdAt: -1 }).select("slug title date location").lean(),
    Booking.aggregate<{ _id: { eventId: unknown; status: BookingStatus }; count: number }>([
      { $group: { _id: { eventId: "$eventId", status: "$status" }, count: { $sum: 1 } } },
    ]),
  ])

  const countFor = (eventId: string, status: BookingStatus) =>
    counts.find((c) => String(c._id.eventId) === eventId && c._id.status === status)?.count ?? 0

  return events.map((event) => ({
    slug: event.slug,
    title: event.title,
    date: event.date,
    location: event.location,
    confirmedCount: countFor(event._id.toString(), "confirmed"),
    pendingCount: countFor(event._id.toString(), "pending"),
  }))
}

/** One event and its bookings (oldest first), or null if the event doesn't exist. */
export async function getEventBookings(
  slug: string,
): Promise<{ event: { _id: string; title: string; date: string; location: string }; bookings: AdminBooking[] } | null> {
  await requireAdmin()
  await connectDB()

  const event = await Event.findOne({ slug: slug.toLowerCase() }).select("title date location").lean()
  if (!event) return null

  const bookings = await Booking.find({ eventId: event._id }).sort({ createdAt: 1 }).lean()

  return {
    event: { _id: event._id.toString(), title: event.title, date: event.date, location: event.location },
    bookings: bookings.map((b) => ({
      _id: b._id.toString(),
      email: b.email,
      ticketId: b.ticketId,
      status: b.status,
      bookedAt: b.createdAt.toISOString(),
    })),
  }
}

/** The event's current values for the edit form, or null if it doesn't exist. */
export async function getEventForEdit(slug: string): Promise<EventFormValues | null> {
  await requireAdmin()
  await connectDB()

  const event = await Event.findOne({ slug: slug.toLowerCase() }).lean()
  if (!event) return null

  return {
    title: event.title,
    description: event.description,
    overview: event.overview,
    image: event.image,
    venue: event.venue,
    location: event.location,
    date: event.date,
    time: event.time,
    mode: event.mode,
    audience: event.audience,
    organizer: event.organizer,
    // Older events stored lists as one JSON string; toList unpacks them.
    agenda: toList(event.agenda),
    tags: toList(event.tags),
  }
}
