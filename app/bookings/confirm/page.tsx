import { Suspense } from "react"
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

  // Always the same component in the same place (see ConfirmBookingButton for why).
  return (
    <ConfirmBookingButton
      token={tokenValue}
      details={
        details && {
          email: details.email,
          title: details.event.title,
          when: `${formatEventDate(details.event.date)} at ${details.event.time}`,
          where: `${details.event.venue}, ${details.event.location}`,
        }
      }
    />
  )
}
