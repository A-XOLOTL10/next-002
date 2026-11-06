import "server-only"
import { revalidateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Event from "@/database/event.model"
import Booking from "@/database/booking.model"
import VipGuest from "@/database/vip-guest.model"
import { isDuplicateKeyError } from "@/database/event.model"
import { isAdminRole } from "@/database/user.constants"
import { VIP_RULES } from "@/database/ticket.constants"
import { actorOf, type CurrentSession } from "@/lib/auth"
import { bookingsTag } from "@/lib/cache-tags"
import { logAction } from "@/lib/audit"
import { LIMITS, consumeAttempt } from "@/lib/rate-limit"
import { emailTicket } from "@/lib/tickets"

// VIP lists. A host (for their own events) or an admin (for any event) adds email addresses;
// each one gets a ticket straight away, with the same kind of QR code and DEV- ticket ID as
// everyone else, and the door scanner shows it as VIP:
//
//   not booked yet     -> a confirmed VIP ticket is made and emailed ("you're invited as a VIP")
//   booking pending    -> confirmed as VIP and emailed (the confirmation link is no longer needed)
//   already confirmed  -> the same ticket becomes VIP, and they're told
//
// Only for live events that haven't ended, with limits per event and per hour, so a VIP list
// can't be used to send mail to strangers. Hosts also set what the door hands out per tier.

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type VipResult = { ok: boolean; message: string }

/** The event, if this account may manage its guests (admins: any event; hosts: their own). */
async function eventFor(session: CurrentSession, slug: string) {
  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase() })
    .select("+doorTags title slug status date time timezone venue location ownerId hideAt")
    .lean()
  if (!event) return null
  if (!isAdminRole(session.user.role) && event.ownerId?.toString() !== session.user.id) return null
  return event
}

const isRunning = (event: { status: string; hideAt?: Date }): boolean => event.status === "published" && !(event.hideAt && event.hideAt.getTime() <= Date.now())

export type VipGuestRow = { email: string; addedByName: string; addedAt: string; ticketId?: string; checkedInAt?: string }

export type VipPageData = {
  event: { slug: string; title: string; date: string; location: string; running: boolean; status: string }
  tags: { regular: string; vip: string }
  guests: VipGuestRow[]
  stats: { tickets: number; vip: number; checkedIn: number }
}

export async function getVipPage(session: CurrentSession, slug: string): Promise<VipPageData | null> {
  const event = await eventFor(session, slug)
  if (!event) return null
  const [guests, bookings] = await Promise.all([
    VipGuest.find({ eventId: event._id }).sort({ createdAt: 1 }).lean(),
    Booking.find({ eventId: event._id, status: "confirmed" }).select("email ticketId tier checkedInAt").lean(),
  ])
  return {
    event: { slug: event.slug, title: event.title, date: event.date, location: event.location, running: isRunning(event), status: event.status },
    tags: { regular: event.doorTags?.regular ?? "", vip: event.doorTags?.vip ?? "" },
    guests: guests.map((g) => {
      const booking = bookings.find((b) => b.email === g.email)
      return { email: g.email, addedByName: g.addedByName, addedAt: g.createdAt.toISOString(), ticketId: booking?.ticketId, checkedInAt: booking?.checkedInAt?.toISOString() }
    }),
    stats: { tickets: bookings.length, vip: bookings.filter((b) => b.tier === "vip").length, checkedIn: bookings.filter((b) => b.checkedInAt).length },
  }
}

/** Adds addresses (pasted, separated by commas, spaces or new lines) and sends each one a VIP ticket. */
export async function addVipGuests(session: CurrentSession, slug: string, pasted: string): Promise<VipResult> {
  const event = await eventFor(session, slug)
  if (!event) return { ok: false, message: "Event not found." }
  if (!isRunning(event)) return { ok: false, message: "VIP guests can be added once the event is live, until it ends." }

  const entries = [...new Set(pasted.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]
  const invalid = entries.filter((e) => e.length > 254 || !EMAIL_REGEX.test(e))
  const emails = entries.filter((e) => !invalid.includes(e))
  if (invalid.length) return { ok: false, message: `Fix these first: ${invalid.slice(0, 5).join(", ")}${invalid.length > 5 ? ` and ${invalid.length - 5} more` : ""}.` }
  if (emails.length === 0) return { ok: false, message: "Paste at least one email address." }
  if (emails.length > VIP_RULES.maxPerSubmit) return { ok: false, message: `Add up to ${VIP_RULES.maxPerSubmit} addresses at a time.` }

  const existing = new Set((await VipGuest.find({ eventId: event._id, email: { $in: emails } }).select("email").lean()).map((g) => g.email))
  const fresh = emails.filter((e) => !existing.has(e))
  if (fresh.length === 0) return { ok: false, message: "Everyone you pasted is already on the VIP list." }
  const total = await VipGuest.countDocuments({ eventId: event._id })
  if (total + fresh.length > VIP_RULES.maxPerEvent) return { ok: false, message: `An event can have up to ${VIP_RULES.maxPerEvent} VIP guests (${total} so far).` }
  if (!(await consumeAttempt(`vip-invite:${session.user.id}`, LIMITS.vipInvite, { failClosed: true }))) {
    return { ok: false, message: "You've added a lot of VIP guests this hour. Please try again later." }
  }

  const emailEvent = { title: event.title, slug: event.slug, date: event.date, time: event.time, timezone: event.timezone, venue: event.venue, location: event.location }
  let sent = 0
  let added = 0
  for (const email of fresh) {
    try {
      await VipGuest.create({ eventId: event._id, email, addedBy: session.user.id, addedByName: session.user.name })
    } catch (e) {
      if (e instanceof Error && isDuplicateKeyError(e)) continue // added by someone else a moment ago
      throw e
    }
    added++

    const booking = await Booking.findOne({ eventId: event._id, email })
    let ticketId: string
    let kind: "invited" | "upgraded"
    if (booking?.status === "confirmed") {
      booking.tier = "vip"
      await booking.save()
      ;({ ticketId } = booking)
      kind = "upgraded"
    } else if (booking) {
      // Pending: the host vouches for the address, so it doesn't need the confirmation link any more.
      booking.set({ status: "confirmed", confirmedAt: new Date(), tier: "vip", source: "vip_invite", verificationTokenHash: undefined, verificationExpiresAt: undefined })
      await booking.save()
      ;({ ticketId } = booking)
      kind = "invited"
    } else {
      const created = await Booking.create({ eventId: event._id, email, status: "confirmed", confirmedAt: new Date(), tier: "vip", source: "vip_invite" })
      ticketId = created.ticketId
      kind = "invited"
    }
    if (await emailTicket(email, ticketId, emailEvent, kind)) sent++
  }

  revalidateTag(bookingsTag(event._id.toString()), { expire: 0 })
  await logAction({
    actor: actorOf(session),
    category: "bookings",
    action: "vip.added",
    summary: `${session.user.name} added ${added} VIP guest(s) to "${event.title}"`,
    target: { type: "event", id: event._id.toString(), label: event.title },
    details: { emails: fresh.slice(0, 100) },
  })
  const unsent = added - sent
  return {
    ok: true,
    message: `${added} VIP guest(s) added.${unsent ? ` ${unsent} ticket email(s) couldn't be sent; they can get their ticket by booking on the event page with the same address.` : " Their tickets are on the way."}`,
  }
}

/**
 * Takes someone off the VIP list. A ticket that only existed because of the VIP invite is
 * cancelled; someone who booked themselves keeps their ticket as a regular one. Tickets
 * already used at the door are left as they were.
 */
export async function removeVipGuest(session: CurrentSession, slug: string, rawEmail: string): Promise<VipResult> {
  const event = await eventFor(session, slug)
  if (!event) return { ok: false, message: "Event not found." }
  const email = rawEmail.trim().toLowerCase()
  const { deletedCount } = await VipGuest.deleteOne({ eventId: event._id, email })
  if (!deletedCount) return { ok: false, message: "That address isn't on the VIP list." }

  const booking = await Booking.findOne({ eventId: event._id, email }).lean()
  let outcome = "kept their ticket"
  if (booking && !booking.checkedInAt) {
    if (booking.source === "vip_invite") {
      await Booking.deleteOne({ _id: booking._id, checkedInAt: { $exists: false } })
      outcome = "VIP ticket cancelled"
    } else {
      await Booking.updateOne({ _id: booking._id }, { $set: { tier: "regular" } })
      outcome = "now holds a regular ticket"
    }
  }
  revalidateTag(bookingsTag(event._id.toString()), { expire: 0 })
  await logAction({
    actor: actorOf(session),
    category: "bookings",
    action: "vip.removed",
    severity: "warning",
    summary: `${session.user.name} removed ${email} from the VIP list of "${event.title}" (${outcome})`,
    target: { type: "event", id: event._id.toString(), label: event.title },
  })
  return { ok: true, message: `Removed: ${outcome}.` }
}

/** What door staff hand out per ticket type ("Blue wristband" / "Gold badge"). Shown in the scanner app. */
export async function saveDoorTags(session: CurrentSession, slug: string, tags: { regular: string; vip: string }): Promise<VipResult> {
  const event = await eventFor(session, slug)
  if (!event) return { ok: false, message: "Event not found." }
  const clean = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, VIP_RULES.tagMaxLength)
  // timestamps: false: internal door notes aren't a change visitors should be told about.
  await Event.updateOne({ _id: event._id }, { $set: { doorTags: { regular: clean(tags.regular), vip: clean(tags.vip) } } }, { timestamps: false })
  await logAction({
    actor: actorOf(session),
    category: "events",
    action: "event.door_tags",
    summary: `${session.user.name} set the door tags for "${event.title}"`,
    target: { type: "event", id: event._id.toString(), label: event.title },
  })
  return { ok: true, message: "Saved. Door staff will see these in the scanner app." }
}
