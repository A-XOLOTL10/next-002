"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import Link from "next/link"
import { confirmBooking, type ConfirmState } from "@/lib/actions/booking.actions"

/** What the server found for this link: the pending booking, or null if the link is invalid or used. */
export type PendingDetails = { email: string; title: string; when: string; where: string } | null

/**
 * The whole confirmation view, in one Client Component that the page renders in the same place
 * whatever the link's state. That matters: confirming refreshes the page from the server, which
 * then sees the link as used (details = null). Because this component stays mounted, it keeps the
 * "confirmed" state and the ticket on screen instead of being replaced by "link already used".
 */
const ConfirmBookingButton = ({ token, details }: { token: string; details: PendingDetails }) => {
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

  if (!details) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          This confirmation link is invalid, has expired, or was already used. If you already confirmed, your ticket is
          in your inbox (check the spam folder too).
        </p>
        <Link href="/events" className="underline">Browse events and book again</Link>
      </div>
    )
  }

  return (
    <div className="bg-dark-100 border-dark-200 flex flex-col gap-4 rounded-[10px] border px-5 py-6">
      <p className="text-xl font-semibold">{details.title}</p>
      <p className="text-light-100">
        {details.when}
        <br />
        {details.where}
      </p>
      <p className="text-sm">
        Booking for <strong>{details.email}</strong>
      </p>
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
