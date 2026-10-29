import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { connection } from "next/server"
import { getPendingBooking } from "@/lib/booking-data"
import ConfirmBookingButton from "@/components/ConfirmBookingButton"
import { formatEventDate } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Confirm your booking | DevEvent",
  robots: { index: false, follow: false },
}

// Opened from the link in the confirmation email. Confirming takes a button press rather
// than happening on page load: email security scanners open links automatically, and
// they shouldn't be able to confirm a booking on the visitor's behalf.
export default function ConfirmBookingPage({ searchParams }: PageProps<"/bookings/confirm">) {
  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-6 py-16">
      <h1 className="text-3xl font-bold">Confirm your booking</h1>
      {/* The token comes from the URL (request-time data), so this part streams in. */}
      <Suspense fallback={<p>Checking your link...</p>}>
        <ConfirmDetails searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function ConfirmDetails({ searchParams }: Pick<PageProps<"/bookings/confirm">, "searchParams">) {
  // The expiry check reads the current time: always run at request time, never prerendered.
  await connection()
  const { token } = await searchParams
  const tokenValue = typeof token === "string" ? token : ""

  let details: Awaited<ReturnType<typeof getPendingBooking>> = null
  let failed = false
  try {
    details = tokenValue ? await getPendingBooking(tokenValue) : null
  } catch (e) {
    console.error("Loading booking confirmation failed:", e)
    failed = true
  }

  if (failed) {
    return <p className="text-red-400">We couldn&apos;t check your link right now. Please refresh the page to try again.</p>
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

  const { email, event } = details
  return (
    <div className="bg-dark-100 border-dark-200 flex flex-col gap-4 rounded-[10px] border px-5 py-6">
      <p className="text-xl font-semibold">{event.title}</p>
      <p className="text-light-100">
        {formatEventDate(event.date)} at {event.time}
        <br />
        {event.venue}, {event.location}
      </p>
      <p className="text-sm">
        Booking for <strong>{email}</strong>
      </p>
      <ConfirmBookingButton token={tokenValue} />
    </div>
  )
}
