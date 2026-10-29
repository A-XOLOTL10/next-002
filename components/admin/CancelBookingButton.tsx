"use client"

import { useState, useTransition } from "react"
import { cancelBooking } from "@/lib/actions/admin.actions"

const CancelBookingButton = ({ bookingId, email }: { bookingId: string; email: string }) => {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    // Cancelling can't be undone, so confirm first.
    if (!window.confirm(`Cancel the booking for ${email}?`)) return

    setError(null)
    startTransition(async () => {
      const result = await cancelBooking(bookingId)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="cursor-pointer text-sm text-red-400 hover:underline disabled:opacity-60"
      >
        {pending ? "Cancelling..." : "Cancel"}
      </button>
      {error && <p className="text-xs text-red-400" role="alert">{error}</p>}
    </div>
  )
}

export default CancelBookingButton
