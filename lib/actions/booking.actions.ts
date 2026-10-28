"use server"

import mongoose from "mongoose"
import { updateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"

export type BookingState = {
  status: "idle" | "success" | "error"
  message: string
}

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i
const MAX_EMAIL_LENGTH = 254 // RFC 5321 limit

/**
 * Books `email` onto an event. Bound to an eventId in the client:
 * `createBooking.bind(null, eventId)`.
 *
 * Format, event-existence and duplicate checks live in the Booking model, so
 * they apply to every write path; this action only guards input shape and
 * turns model errors into user-facing messages.
 */
export async function createBooking(
  eventId: string,
  _prevState: BookingState,
  formData: FormData,
): Promise<BookingState> {
  const email = formData.get("email")

  // Server-side checks: the browser's `required`/`type="email"` can be bypassed.
  if (typeof email !== "string" || !email.trim()) {
    return { status: "error", message: "Please enter your email address." }
  }
  if (email.length > MAX_EMAIL_LENGTH) {
    return { status: "error", message: "That email address is too long." }
  }
  if (!OBJECT_ID_PATTERN.test(eventId)) {
    return { status: "error", message: "This event could not be found." }
  }

  try {
    await connectDB()
    // A unique { eventId, email } index rejects duplicates, even when two requests race.
    await Booking.create({ eventId, email })
  } catch (e) {
    // Invalid email, missing event, or already booked: show the model's message.
    if (e instanceof mongoose.Error.ValidationError) {
      const [firstError] = Object.values(e.errors)
      return { status: "error", message: firstError?.message ?? "Invalid booking details." }
    }

    console.error("Booking failed:", e)
    return { status: "error", message: "We couldn't complete your booking. Please try again." }
  }

  // Refresh the cached booking count on the event page.
  updateTag(`bookings-${eventId}`)

  return { status: "success", message: "You're booked! See you at the event." }
}
