"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { confirmBooking, type ConfirmState } from "@/lib/actions/booking.actions"

const ConfirmBookingButton = ({ token }: { token: string }) => {
  const [state, setState] = useState<ConfirmState>({ status: "idle" })
  const [pending, startTransition] = useTransition()

  const handleConfirm = () =>
    startTransition(async () => {
      try {
        setState(await confirmBooking(token))
      } catch {
        // The request itself failed, e.g. the connection dropped.
        setState({ status: "error", message: "Something went wrong. Check your connection and try again." })
      }
    })

  if (state.status === "confirmed") {
    return (
      <div className="flex flex-col items-center gap-3 text-center" role="status">
        <p className="font-semibold text-green-400">You&apos;re booked! See you there.</p>
        {/* A data URL needs no image optimizing. */}
        <Image src={state.qrDataUrl} alt={`QR code for ticket ${state.ticketId}`} width={220} height={220} unoptimized className="size-[220px] rounded-md" />
        <p>
          Your ticket ID: <strong className="font-mono">{state.ticketId}</strong>
        </p>
        <p className="text-sm">
          {state.emailed ? (
            <>
              We&apos;ve emailed your ticket to <strong>{state.email}</strong>. Check your inbox, or your spam folder if
              you don&apos;t see it within a few minutes.
            </>
          ) : (
            <>We couldn&apos;t email your ticket, so please save or screenshot this QR code now.</>
          )}
        </p>
        <p className="text-light-200 text-xs">Show this QR code at the entrance. It can only be scanned once.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {state.status === "error" && <p className="text-sm text-red-400" role="alert">{state.message}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={handleConfirm}
        className="bg-primary hover:bg-primary/90 cursor-pointer rounded-[6px] px-4 py-2.5 text-lg font-semibold text-black disabled:opacity-60"
      >
        {pending ? "Confirming..." : "Confirm my booking"}
      </button>
    </div>
  )
}

export default ConfirmBookingButton
