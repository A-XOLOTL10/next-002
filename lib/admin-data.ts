import "server-only"
import connectDB from "@/lib/mongodb"
import Event, { type IEvent } from "@/database/event.model"
import Booking, { type BookingStatus } from "@/database/booking.model"
import type { EventStatus, ImageDisplay } from "@/database/event.constants"
import type { TicketTier } from "@/database/ticket.constants"
import { requireAdmin, requireUser } from "@/lib/auth"
import { isAdminRole } from "@/database/user.constants"
import { findMissingFields } from "@/lib/events.service"
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
  status: EventStatus
  endsAt?: string
  hideAt?: string
  confirmedCount: number
  pendingCount: number
  checkedInCount: number
}

export type AdminBooking = {
  _id: string
  email: string
  ticketId: string
  status: BookingStatus
  bookedAt: string // ISO timestamp
  checkedInAt?: string // ISO timestamp
  checkedInBy?: string
  tier: TicketTier
}

/** Values for the edit form. Lists are already split into items. */
export type EventFormValues = Partial<
  Pick<
    IEvent,
    | "title" | "description" | "overview" | "venue" | "location" | "date" | "time" | "endDate" | "endTime"
    | "timezone" | "mode" | "category" | "audience" | "organizer" | "agenda" | "tags" | "images"
  >
> & { status: EventStatus; imageDisplay: ImageDisplay }

export type DraftSummary = {
  slug: string
  title: string
  date?: string
  location?: string
  image?: string
  source: IEvent["source"]
  importNotes: string[]
  missing: string[] // field names stopping this draft going live
}

/** An event as the preview needs it: every field, plain JSON, any status. */
export type EventPreview = Omit<IEvent, "startsAt" | "endsAt" | "hideAt" | "publishedAt" | "createdAt" | "updatedAt"> & {
  _id: string
  endsAt?: string
  missing: Record<string, string>
}

export type TicketCheckIn = {
  ticketId: string
  email: string
  status: BookingStatus
  checkedInAt?: string
  tier: TicketTier
  /** What to hand this guest at the door, from the event's door tags. */
  tag?: string
  event: { title: string; date: string; time: string; venue: string; location: string; timezone: string; hideAt?: string } | null
}

/** All events, newest first, with booking counts. */
export async function getEventsWithBookingCounts(): Promise<AdminEventSummary[]> {
  await requireAdmin()
  await connectDB()

  const [events, counts] = await Promise.all([
    Event.find({ status: "published" }).sort({ startsAt: 1 }).select("slug title date location status endsAt hideAt").lean(),
    Booking.aggregate<{ _id: { eventId: unknown; status: BookingStatus }; count: number; checkedIn: number }>([
      {
        $group: {
          _id: { eventId: "$eventId", status: "$status" },
          count: { $sum: 1 },
          checkedIn: { $sum: { $cond: [{ $ifNull: ["$checkedInAt", false] }, 1, 0] } },
        },
      },
    ]),
  ])

  const countsFor = (eventId: string, status: BookingStatus) =>
    counts.find((c) => String(c._id.eventId) === eventId && c._id.status === status)

  return events.map((event) => {
    const id = event._id.toString()
    return {
      slug: event.slug,
      title: event.title,
      date: event.date,
      location: event.location,
      status: event.status,
      endsAt: event.endsAt?.toISOString(),
      hideAt: event.hideAt?.toISOString(),
      confirmedCount: countsFor(id, "confirmed")?.count ?? 0,
      pendingCount: countsFor(id, "pending")?.count ?? 0,
      checkedInCount: countsFor(id, "confirmed")?.checkedIn ?? 0,
    }
  })
}

/** Events waiting for review, oldest first, each with what's stopping it going live. */
export async function getDrafts(): Promise<DraftSummary[]> {
  await requireAdmin()
  await connectDB()

  // Admin drafts only: a host's unfinished drafts are theirs, and host events are reviewed in Approvals.
  const drafts = await Event.find({ status: "draft", ownerId: { $exists: false } }).sort({ createdAt: 1 }).lean()

  return drafts.map((draft) => ({
    slug: draft.slug,
    title: draft.title,
    date: draft.date,
    location: draft.location,
    image: draft.images[0],
    source: draft.source,
    importNotes: draft.importNotes,
    missing: Object.keys(findMissingFields(draft)),
  }))
}

export async function getDraftCount(): Promise<number> {
  await requireAdmin()
  await connectDB()
  return Event.countDocuments({ status: "draft", ownerId: { $exists: false } })
}

/** Any event by slug for the admin preview, or null. Lists are already split into items. */
export async function getEventPreview(slug: string): Promise<EventPreview | null> {
  await requireAdmin()
  await connectDB()

  const event = await Event.findOne({ slug: slug.toLowerCase() })
    .select("-startsAt -hideAt -publishedAt -createdAt -updatedAt")
    .lean()
  if (!event) return null

  return {
    ...event,
    _id: event._id.toString(),
    endsAt: event.endsAt?.toISOString(),
    agenda: toList(event.agenda),
    tags: toList(event.tags),
    missing: findMissingFields(event),
  }
}

/** One event and its bookings (oldest first), or null if the event doesn't exist. */
export async function getEventBookings(
  slug: string,
): Promise<{ event: { _id: string; title: string; date: string; location: string; status: EventStatus }; bookings: AdminBooking[] } | null> {
  await requireAdmin()
  await connectDB()

  const event = await Event.findOne({ slug: slug.toLowerCase() }).select("title date location status").lean()
  if (!event) return null

  const bookings = await Booking.find({ eventId: event._id }).sort({ createdAt: 1 }).lean()

  return {
    event: { _id: event._id.toString(), title: event.title, date: event.date, location: event.location, status: event.status },
    bookings: bookings.map((b) => ({
      _id: b._id.toString(),
      email: b.email,
      ticketId: b.ticketId,
      status: b.status,
      bookedAt: b.createdAt.toISOString(),
      checkedInAt: b.checkedInAt?.toISOString(),
      checkedInBy: b.checkedInBy?.name,
      tier: b.tier === "vip" ? "vip" : "regular",
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
    images: event.images,
    imageDisplay: event.imageDisplay,
    venue: event.venue,
    location: event.location,
    date: event.date,
    time: event.time,
    endDate: event.endDate,
    endTime: event.endTime,
    timezone: event.timezone,
    mode: event.mode,
    category: event.category,
    audience: event.audience,
    organizer: event.organizer,
    status: event.status,
    // Older events stored lists as one JSON string; toList unpacks them.
    agenda: toList(event.agenda),
    tags: toList(event.tags),
  }
}

/** Accepts a ticket ID or a whole scanned link (old "?ticket=DEV-..." links and new "/t/DEV-..." ones). */
export const parseTicketInput = async (input: string): Promise<string> =>
  (input.match(/ticket=([\w%-]+)/)?.[1] ?? input.match(/\/t\/([\w-]+)/)?.[1] ?? input).trim().toUpperCase().slice(0, 40)

/**
 * What door staff see for a scanned ticket, or null if there's no such ticket or this account
 * may not see it. Admins see every ticket; a host only tickets for events they own.
 */
export async function getTicketForCheckIn(input: string): Promise<TicketCheckIn | null> {
  const session = await requireUser()
  await connectDB()

  const ticketId = await parseTicketInput(input)
  if (!/^DEV-[A-Z0-9]{10}$/.test(ticketId)) return null
  const booking = await Booking.findOne({ ticketId }).lean()
  if (!booking) return null

  const event = await Event.findById(booking.eventId).select("+doorTags title date time venue location timezone hideAt ownerId").lean()
  // A host can't look up (or admit) tickets for someone else's event: answer as if it doesn't exist.
  if (!isAdminRole(session.user.role) && event?.ownerId?.toString() !== session.user.id) return null

  return {
    ticketId: booking.ticketId,
    email: booking.email,
    status: booking.status,
    checkedInAt: booking.checkedInAt?.toISOString(),
    tier: booking.tier === "vip" ? "vip" : "regular",
    tag: event?.doorTags?.[booking.tier === "vip" ? "vip" : "regular"] || undefined,
    event: event && {
      title: event.title,
      date: event.date,
      time: event.time,
      venue: event.venue,
      location: event.location,
      timezone: event.timezone,
      hideAt: event.hideAt?.toISOString(),
    },
  }
}
