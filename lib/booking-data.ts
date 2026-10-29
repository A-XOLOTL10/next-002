import "server-only"
import { createHash } from "node:crypto"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import Event from "@/database/event.model"

export type PendingBookingDetails = {
  email: string
  event: { title: string; slug: string; date: string; time: string; venue: string; location: string }
}

/**
 * What the confirmation page shows before the visitor clicks "Confirm": the event and
 * email behind a token. Null when the link is invalid, expired or already used.
 * Not cached: each token is used once, and the answer changes as soon as it's confirmed.
 */
export async function getPendingBooking(token: string): Promise<PendingBookingDetails | null> {
  if (token.length < 20 || token.length > 100) return null

  await connectDB()
  const booking = await Booking.findOne({
    verificationTokenHash: createHash("sha256").update(token).digest("hex"),
    status: "pending",
    verificationExpiresAt: { $gt: new Date() },
  })
    .select("email eventId")
    .lean()
  if (!booking) return null

  const event = await Event.findById(booking.eventId).select("title slug date time venue location").lean()
  if (!event) return null

  return {
    email: booking.email,
    event: { title: event.title, slug: event.slug, date: event.date, time: event.time, venue: event.venue, location: event.location },
  }
}
