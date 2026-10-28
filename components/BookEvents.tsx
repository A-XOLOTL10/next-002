"use client"

import { useActionState, useState } from "react"
import { createBooking, type BookingState } from "@/lib/actions/booking.actions"

const initialState: BookingState = { status: "idle", message: "" }

const BookEvents = ({ eventId }: { eventId: string }) => {
  // Controlled so the typed email survives a failed submission (React resets uncontrolled form fields).
  const [email, setEmail] = useState("")
  const [state, formAction, pending] = useActionState(createBooking.bind(null, eventId), initialState)

  if (state.status === "success") {
    return (
      <div id="book-event">
        <p className="text-sm" role="status">{state.message}</p>
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
          {pending ? "Booking..." : "Submit"}
        </button>
      </form>
    </div>
  )
}

export default BookEvents
