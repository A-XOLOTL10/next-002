import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import SessionLoader from "@/components/SessionLoader"
import { getSession } from "@/lib/auth"

export const metadata: Metadata = { title: "Ticket | DevEvent", robots: { index: false, follow: false } }

// Where a ticket's QR code leads. Staff (signed in) go to check-in; the ticket holder or anyone
// else who scans it just sees how to use it. Nothing about the ticket is shown here, so a
// photographed QR code reveals nothing.
export default function TicketPage({ params }: PageProps<"/t/[ticket]">) {
  return (
    <Suspense fallback={<SessionLoader label="Opening ticket..." />}>
      <Ticket params={params} />
    </Suspense>
  )
}

async function Ticket({ params }: Pick<PageProps<"/t/[ticket]">, "params">) {
  const { ticket } = await params
  const ticketId = decodeURIComponent(ticket).toUpperCase()

  // Signed-in staff: straight to check-in. Admitting still takes a button press there.
  if (/^DEV-[A-Z0-9]{10}$/.test(ticketId) && (await getSession())) redirect(`/host/check-in?ticket=${encodeURIComponent(ticketId)}`)

  return (
    <section className="flex-center min-h-[50vh] flex-col gap-4 py-16 text-center">
      <p className="text-primary font-mono text-2xl font-bold">{/^DEV-[A-Z0-9]{10}$/.test(ticketId) ? ticketId : "DevEvent ticket"}</p>
      <h1 className="text-3xl font-bold">Show this at the entrance</h1>
      <p className="text-light-100 max-w-md">
        This is a DevEvent ticket. Event staff scan it at the door, and each ticket can be used once. Keep the QR code from your
        email handy and don&apos;t share it.
      </p>
    </section>
  )
}
