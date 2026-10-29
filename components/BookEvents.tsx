"use client"

import { useActionState, useState } from "react"
import { createBooking, type BookingState } from "@/lib/actions/booking.actions"

const initialState: BookingState = { status: "idle" }

const BookEvents = ({ eventId }: { eventId: string }) => {
  // Controlled so the typed email survives a failed submission (React resets uncontrolled form fields).
  const [email, setEmail] = useState("")
  const [state, formAction, pending] = useActionState(createBooking.bind(null, eventId), initialState)

  // Step 1 done: the booking is pending until the visitor clicks the emailed link.
  if (state.status === "pending") {
    return (
      <div id="book-event" role="status" className="flex flex-col gap-3">
        <p className="font-semibold">Almost there! Check your email to confirm.</p>
        <p className="text-sm">
          We&apos;ve sent a confirmation link to <strong>{state.email}</strong>. Open it to confirm your spot. Your
          ticket ID will be emailed to you as soon as you confirm.
        </p>
        <p className="text-sm">
          Can&apos;t find it? Check your <strong>spam or junk folder</strong>. The link expires in 24 hours. To get a new
          link, just book again with the same email.
        </p>
      </div>
    )
  }

  return (
    <div id="book-event">
      <form action={formAction}>
        <div>
          <label htmlFor="email">Email Address</label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            autoComplete="email"
            maxLength={254}
            required
            readOnly={pending}
          />
        </div>

        {state.status === "error" && (
          <p className="text-sm text-red-400" role="alert">{state.message}</p>
        )}

        {/* Disabled while pending to prevent double submissions. */}
        <button type="submit" disabled={pending}>
          {pending ? "Booking..." : "Book my free spot"}
        </button>
        <p className="text-xs text-light-200">Free event. We&apos;ll email you a link to confirm your booking.</p>
      </form>
    </div>
  )
}

export default BookEvents
