"use server"

import { createHash, randomBytes } from "node:crypto"
import mongoose from "mongoose"
import { headers } from "next/headers"
import { after } from "next/server"
import { updateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import Event from "@/database/event.model"
import { bookingsTag } from "@/lib/cache-tags"
import { sendBookingConfirmation, sendBookingVerification } from "@/lib/email"
import { isPastEvent } from "@/lib/utils"

// No "use cache" in this file: Server Actions write data, and caching a write would
// skip it. Instead, confirming a booking clears the cached count below.
//
// Booking flow (events are free, so the email address is what we verify):
//   1. createBooking  -> saves a *pending* booking and emails a one-time confirmation link
//   2. confirmBooking -> the visitor opens the link and confirms; booking becomes *confirmed*,
//                        counts toward the event, and the ticket ID is emailed.
// Unconfirmed bookings are deleted automatically after 24 hours (TTL index on the model).

export type BookingState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "pending"; email: string }

export type ConfirmState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "confirmed"; ticketId: string; email: string }

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const MAX_EMAIL_LENGTH = 254 // RFC 5321 limit
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000

const EVENT_EMAIL_FIELDS = "title slug date time venue location"
type EmailEvent = { title: string; slug: string; date: string; time: string; venue: string; location: string }

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex")

/** Absolute URL for links in emails: NEXT_PUBLIC_BASE_URL, else the host this request came to. */
async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

/**
 * Step 1. Bound to an eventId in the client: `createBooking.bind(null, eventId)`.
 * check input -> load event (exists, not past) -> save pending booking -> email the link.
 */
export async function createBooking(
  eventId: string,
  _prevState: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const rawEmail = formData.get("email")

  // Input shape. The browser's `required`/`type="email"` can be bypassed, so re-check here.
  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    return { status: "error", message: "Please enter your email address." }
  }
  if (rawEmail.length > MAX_EMAIL_LENGTH) {
    return { status: "error", message: "That email address is too long." }
  }
  if (!OBJECT_ID_PATTERN.test(eventId)) {
    return { status: "error", message: "This event could not be found." }
  }
  const email = rawEmail.trim().toLowerCase()

  // A fresh one-time token: the raw token goes in the email, only its hash is stored.
  const token = randomBytes(32).toString("base64url")
  const verification = { verificationTokenHash: hashToken(token), verificationExpiresAt: new Date(Date.now() + LINK_LIFETIME_MS) }

  let event: EmailEvent | null
  try {
    await connectDB()

    event = await Event.findById(eventId).select(EVENT_EMAIL_FIELDS).lean()
    if (!event) return { status: "error", message: "This event could not be found." }
    if (isPastEvent(event.date)) return { status: "error", message: "This event has already taken place." }

    const existing = await Booking.findOne({ eventId, email })
    if (existing?.status === "confirmed") {
      return { status: "error", message: "This email has already booked this event." }
    }

    if (existing) {
      // Already pending (maybe the first email got lost): send a new link rather than an error,
      // so the real owner of the address can always finish booking.
      existing.set(verification)
      await existing.save()
    } else {
      // The unique { eventId, email } index still guards against two requests racing.
      await Booking.create({ eventId, email, status: "pending", ...verification })
    }
  } catch (e) {
    // Invalid email format, or a duplicate from a race: show the model's message.
    if (e instanceof mongoose.Error.ValidationError) {
      const [firstError] = Object.values(e.errors)
      return { status: "error", message: firstError?.message ?? "Invalid booking details." }
    }
    console.error("Booking failed:", e)
    return { status: "error", message: "We couldn't complete your booking. Please try again." }
  }

  // Email after the response is sent, so the visitor isn't kept waiting on SMTP.
  const confirmUrl = `${await getBaseUrl()}/bookings/confirm?token=${token}`
  const emailEvent = event
  after(async () => {
    try {
      await sendBookingVerification({ to: email, confirmUrl, event: emailEvent })
    } catch (e) {
      console.error(`Confirmation-link email failed for ${email}:`, e)
    }
  })

  return { status: "pending", email }
}

/** Step 2: called from the page the email link opens. */
export async function confirmBooking(token: string): Promise<ConfirmState> {
  const invalid: ConfirmState = {
    status: "error",
    message: "This confirmation link is invalid, has expired, or was already used. If you already confirmed, check your inbox for your ticket; otherwise, book again from the event page.",
  }
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return invalid

  let ticketId: string
  let email: string
  let eventId: string
  let event: EmailEvent | null
  try {
    await connectDB()

    // One atomic update: only an unexpired pending booking with this token matches, and the
    // token is removed in the same step, so a link can't confirm twice (even if clicked twice).
    const booking = await Booking.findOneAndUpdate(
      { verificationTokenHash: hashToken(token), status: "pending", verificationExpiresAt: { $gt: new Date() } },
      {
        $set: { status: "confirmed", confirmedAt: new Date() },
        $unset: { verificationTokenHash: 1, verificationExpiresAt: 1 },
      },
      { returnDocument: "after" },
    ).lean()
    if (!booking) return invalid

    ;({ ticketId, email } = booking)
    eventId = booking.eventId.toString()
    event = await Event.findById(booking.eventId).select(EVENT_EMAIL_FIELDS).lean()
  } catch (e) {
    console.error("Booking confirmation failed:", e)
    return { status: "error", message: "We couldn't confirm your booking. Please try the link again." }
  }

  // The public count only includes confirmed bookings: refresh it.
  updateTag(bookingsTag(eventId))

  // Ticket email after the response; a mail failure doesn't undo the confirmation
  // (the ticket ID is also shown on screen).
  if (event) {
    const ticketEvent = event
    after(async () => {
      try {
        await sendBookingConfirmation({ to: email, ticketId, event: ticketEvent })
      } catch (e) {
        console.error(`Ticket email failed for ${ticketId}:`, e)
      }
    })
  }

  return { status: "confirmed", ticketId, email }
}
