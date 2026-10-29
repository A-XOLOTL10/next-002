"use client"

import { useState, useTransition } from "react"
import { confirmBooking, type ConfirmState } from "@/lib/actions/booking.actions"

const ConfirmBookingButton = ({ token }: { token: string }) => {
  const [state, setState] = useState<ConfirmState>({ status: "idle" })
  const [pending, startTransition] = useTransition()

  if (state.status === "confirmed") {
    return (
      <div className="flex flex-col gap-2" role="status">
        <p className="font-semibold text-green-400">You&apos;re booked! See you there.</p>
        <p>
          Your ticket ID: <strong className="font-mono">{state.ticketId}</strong>
        </p>
        <p className="text-sm">
          We&apos;ve emailed your ticket to <strong>{state.email}</strong>. Check your inbox, or your spam folder if you
          don&apos;t see it within a few minutes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {state.status === "error" && <p className="text-sm text-red-400" role="alert">{state.message}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await confirmBooking(token)))}
        className="bg-primary hover:bg-primary/90 cursor-pointer rounded-[6px] px-4 py-2.5 text-lg font-semibold text-black disabled:opacity-60"
      >
        {pending ? "Confirming..." : "Confirm my booking"}
      </button>
    </div>
  )
}

export default ConfirmBookingButton
