"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { checkInTicket, type CheckInState } from "@/lib/actions/admin.actions"

/**
 * Admits a scanned ticket. Admitting takes a button press: opening the link alone must never
 * use up a ticket, because phones and browsers can open links ahead of time.
 */
const CheckInPanel = ({ ticketId }: { ticketId: string }) => {
  const [result, setResult] = useState<CheckInState>(null)
  const [pending, startTransition] = useTransition()

  const handleCheckIn = () =>
    startTransition(async () => {
      try {
        setResult(await checkInTicket(ticketId))
      } catch {
        setResult({ ok: false, message: "Something went wrong. Check your connection and try again." })
      }
    })

  return (
    <div className="flex flex-col gap-3">
      {result && (
        <p
          role="alert"
          className={`rounded-md px-4 py-3 text-lg font-bold ${result.ok ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}
        >
          {result.message}
        </p>
      )}

      {result ? (
        <Link href="/host/check-in" className="admin-button text-center">Scan the next ticket</Link>
      ) : (
        <button type="button" onClick={handleCheckIn} disabled={pending} className="admin-button text-lg">
          {pending ? "Checking in..." : "Admit this ticket"}
        </button>
      )}
    </div>
  )
}

export default CheckInPanel
