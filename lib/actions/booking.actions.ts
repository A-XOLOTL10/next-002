"use server"

import { createHash, randomBytes } from "node:crypto"
import mongoose from "mongoose"
import { revalidateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import Event from "@/database/event.model"
import { baseUrlIsConfigured, getBaseUrl } from "@/lib/base-url"
import { bookingsTag } from "@/lib/cache-tags"
import { emailIsConfigured, sendBookingConfirmation, sendBookingVerification, type EmailEvent } from "@/lib/email"
import { LIMITS, clientIp, consumeAttempt } from "@/lib/rate-limit"
import { checkInUrl, ticketQrDataUrl, ticketQrPng } from "@/lib/tickets"
import { hasEnded } from "@/lib/utils"

// No "use cache" in this file: Server Actions write data, and caching a write would
// skip it. Instead, confirming a booking clears the cached count below.
//
// Booking flow (events are free, so the email address is what we verify):
//   1. createBooking  -> saves a *pending* booking and emails a one-time confirmation link
//   2. confirmBooking -> the visitor opens the link and confirms; the booking becomes
//                        *confirmed*, counts toward the event, and the ticket QR is emailed.
// Unconfirmed bookings are deleted automatically after 24 hours (TTL index on the model).

export type BookingState =
  | { status: "idle" }
  | { status: "error"; message: string }
  // devConfirmUrl: only in development with no SMTP, so booking can still be tested.
  | { status: "pending"; email: string; devConfirmUrl?: string }

export type ConfirmState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "confirmed"; ticketId: string; email: string; qrDataUrl: string; emailed: boolean }

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const MAX_EMAIL_LENGTH = 254 // RFC 5321 limit
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000

const EVENT_FIELDS = "title slug date time timezone venue location status endsAt"

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

const failed = (message: string): BookingState => ({ status: "error", message })

/** Emails a ticket with its QR code. Returns whether it was actually sent. */
async function sendTicket(to: string, ticketId: string, event: EmailEvent): Promise<boolean> {
  if (!emailIsConfigured()) return false
  try {
    const qrPng = await ticketQrPng(checkInUrl(await getBaseUrl(), ticketId))
    await sendBookingConfirmation({ to, ticketId, qrPng, event })
    return true
  } catch (e) {
    console.error(`Ticket email failed for ${ticketId}:`, e)
    return false
  }
}

/**
 * Step 1. Bound to an eventId in the client: `createBooking.bind(null, eventId)`.
 * check input -> check limits -> load event (live, not over) -> save pending booking -> email the link.
 */
export async function createBooking(
  eventId: string,
  _prevState: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const rawEmail = formData.get("email")

  // Input shape. The browser's `required`/`type="email"` can be bypassed, so re-check here.
  if (typeof rawEmail !== "string" || !rawEmail.trim()) return failed("Please enter your email address.")
  if (rawEmail.length > MAX_EMAIL_LENGTH) return failed("That email address is too long.")
  if (!OBJECT_ID_PATTERN.test(eventId)) return failed("This event could not be found.")
  const email = rawEmail.trim().toLowerCase()

  // Without a mail server nobody could confirm, so don't take the booking in production.
  const canEmail = emailIsConfigured()
  if (!canEmail && process.env.NODE_ENV === "production") {
    console.error("Booking refused: SMTP isn't configured, so no confirmation email can be sent.")
    return failed("Bookings are temporarily unavailable. Please try again later.")
  }
  if (!baseUrlIsConfigured()) {
    console.error("Booking refused: NEXT_PUBLIC_BASE_URL isn't set, so the email link can't be built safely.")
    return failed("Bookings are temporarily unavailable. Please try again later.")
  }

  if (!(await consumeAttempt(`booking-ip:${await clientIp()}`, LIMITS.bookingPerIp))) {
    return failed("Too many booking attempts. Please try again later.")
  }

  // Each address gets a few emails per event per hour, so nobody can flood someone's inbox.
  const emailAllowed = () => consumeAttempt(`booking-email:${eventId}:${email}`, LIMITS.bookingEmail)

  // A fresh one-time token: the raw token goes in the email, only its hash is stored.
  const token = randomBytes(32).toString("base64url")
  const verification = {
    verificationTokenHash: hashToken(token),
    verificationExpiresAt: new Date(Date.now() + LINK_LIFETIME_MS),
  }

  let event: (EmailEvent & { status: string; endsAt?: Date }) | null
  let createdNew = false
  try {
    await connectDB()

    event = await Event.findById(eventId).select(EVENT_FIELDS).lean()
    if (!event || event.status !== "published") return failed("This event could not be found.")
    if (hasEnded(event.endsAt)) return failed("This event has already ended.")

    const existing = await Booking.findOne({ eventId, email })

    if (existing?.status === "confirmed") {
      // Lost the ticket? Booking again sends it back to the address it belongs to.
      const resent = (await emailAllowed()) && (await sendTicket(email, existing.ticketId, event))
      return failed(`This email has already booked this event.${resent ? " We've sent your ticket again." : ""}`)
    }

    if (!(await emailAllowed())) {
      return failed("We've already sent several links to this address. Check your inbox and spam folder, or try again in an hour.")
    }

    if (existing) {
      // Already pending (maybe the first email got lost): send a new link rather than an error,
      // so the real owner of the address can always finish booking.
      existing.set(verification)
      await existing.save()
    } else {
      // The unique { eventId, email } index still guards against two requests racing.
      await Booking.create({ eventId, email, status: "pending", ...verification })
      createdNew = true
    }
  } catch (e) {
    // Invalid email format, or a duplicate from a race: show the model's message.
    if (e instanceof mongoose.Error.ValidationError) {
      const [firstError] = Object.values(e.errors)
      return failed(firstError?.message ?? "Invalid booking details.")
    }
    console.error("Booking failed:", e)
    return failed("We couldn't complete your booking. Please try again.")
  }

  const confirmUrl = `${await getBaseUrl()}/bookings/confirm?token=${token}`

  if (!canEmail) {
    console.warn(`SMTP isn't configured. Confirmation link for ${email}:\n  ${confirmUrl}`)
    return { status: "pending", email, devConfirmUrl: confirmUrl }
  }

  // Sent before replying, so the visitor is only told to check their inbox if it really went.
  try {
    await sendBookingVerification({ to: email, confirmUrl, event })
  } catch (e) {
    console.error(`Confirmation email failed for ${email}:`, e)
    // Don't leave a booking behind that nobody can ever confirm. Matched on this attempt's token,
    // so a newer request for the same address (maybe already confirmed) is never deleted.
    if (createdNew) {
      await Booking.deleteOne({ eventId, email, status: "pending", verificationTokenHash: verification.verificationTokenHash })
        .catch(() => undefined)
    }
    return failed("We couldn't send your confirmation email. Check the address and try again.")
  }

  return { status: "pending", email }
}

/** Step 2: called from the page the email link opens. */
export async function confirmBooking(token: string): Promise<ConfirmState> {
  const invalid: ConfirmState = {
    status: "error",
    message: "This confirmation link is invalid, has expired, or was already used. If you already confirmed, check your inbox for your ticket; otherwise, book again from the event page.",
  }
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return invalid
  // The ticket's QR code needs the site address: check before the link is used up.
  if (!baseUrlIsConfigured()) {
    console.error("Confirmation refused: NEXT_PUBLIC_BASE_URL isn't set.")
    return { status: "error", message: "We couldn't confirm your booking right now. Please try the link again later." }
  }

  let ticketId: string
  let email: string
  let eventId: string
  let event: (EmailEvent & { endsAt?: Date }) | null
  try {
    await connectDB()

    const tokenMatch = {
      verificationTokenHash: hashToken(token),
      status: "pending" as const,
      verificationExpiresAt: { $gt: new Date() },
    }

    // A link can outlive the event, or the event may have been removed since it was sent.
    const pending = await Booking.findOne(tokenMatch).select("eventId").lean()
    if (!pending) return invalid
    event = await Event.findById(pending.eventId).select(EVENT_FIELDS).lean()
    if (!event || hasEnded(event.endsAt)) {
      return { status: "error", message: "This event has ended, so this booking can no longer be confirmed." }
    }

    // One atomic update: the token is removed in the same step that confirms the booking,
    // so a link can't confirm twice, even if it's clicked twice at once.
    const booking = await Booking.findOneAndUpdate(
      tokenMatch,
      {
        $set: { status: "confirmed", confirmedAt: new Date() },
        $unset: { verificationTokenHash: 1, verificationExpiresAt: 1 },
      },
      { returnDocument: "after" },
    ).lean()
    if (!booking) return invalid

    ;({ ticketId, email } = booking)
    eventId = booking.eventId.toString()
  } catch (e) {
    console.error("Booking confirmation failed:", e)
    return { status: "error", message: "We couldn't confirm your booking. Please try the link again." }
  }

  // The public count only includes confirmed bookings: expire it. Not updateTag: that also
  // re-renders this page from the server, where the link now reads as "already used", and
  // would wipe the ticket off the visitor's screen.
  revalidateTag(bookingsTag(eventId), { expire: 0 })

  // The ticket is also shown on screen, so a mail failure doesn't lose it.
  const qrDataUrl = await ticketQrDataUrl(checkInUrl(await getBaseUrl(), ticketId))
  const emailed = await sendTicket(email, ticketId, event)

  return { status: "confirmed", ticketId, email, qrDataUrl, emailed }
}
