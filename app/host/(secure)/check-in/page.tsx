import { Suspense } from "react"
import { connection } from "next/server"
import { StaffNav } from "@/components/host/HostNav"
import CheckInPanel from "@/components/admin/CheckInPanel"
import { getTicketForCheckIn } from "@/lib/admin-data"
import { requireUser } from "@/lib/auth"
import { formatEventDate, hasEnded } from "@/lib/utils"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const formatCheckedIn = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC"

// Ticket check-in for admins (any ticket) and hosts (tickets for their own events only). Door
// staff scan a QR code with any phone camera (it opens /t/DEV-..., which forwards here) or type the ID.
export default function CheckInPage({ searchParams }: PageProps<"/host/check-in">) {
  return (
    <>
      <StaffNav />
      <h1 className="text-3xl font-bold">Ticket Check-in</h1>

      {/* searchParams and the session cookie are request-time data, so this streams in. */}
      <Suspense fallback={<p>Loading...</p>}>
        <CheckIn searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function CheckIn({ searchParams }: Pick<PageProps<"/host/check-in">, "searchParams">) {
  await connection()
  // Signed-in accounts only; getTicketForCheckIn hides tickets for events this account doesn't run.
  await requireUser()

  const { ticket } = await searchParams
  const query = typeof ticket === "string" ? ticket.trim() : ""

  return (
    <div className="flex max-w-lg flex-col gap-6">
      {/* A plain GET form: looking a ticket up changes nothing. */}
      <form className="flex gap-2" action="/host/check-in">
        <input
          name="ticket"
          defaultValue={query}
          placeholder="DEV-XXXXXXXXXX"
          aria-label="Ticket ID"
          autoComplete="off"
          className="admin-input font-mono"
        />
        <button type="submit" className="admin-button">Find</button>
      </form>

      {query ? (
        <TicketResult input={query} />
      ) : (
        <p className="text-light-100 text-sm">Scan a ticket&apos;s QR code with your phone camera, or enter its ticket ID.</p>
      )}
    </div>
  )
}

async function TicketResult({ input }: { input: string }) {
  let ticket
  try {
    ticket = await getTicketForCheckIn(input)
  } catch (e) {
    console.error("Ticket lookup failed:", e)
    return <p className="text-red-400" role="alert">Couldn&apos;t look this ticket up. Please try again.</p>
  }

  if (!ticket) {
    return <p className="rounded-md bg-red-500/20 px-4 py-3 text-lg font-bold text-red-400" role="alert">Invalid ticket. It may have been cancelled.</p>
  }

  const used = Boolean(ticket.checkedInAt)
  const unconfirmed = ticket.status !== "confirmed"
  const over = hasEnded(ticket.event?.hideAt)

  return (
    <div className="bg-dark-100 border-dark-200 flex flex-col gap-3 rounded-[10px] border px-5 py-5">
      {ticket.event ? (
        <div>
          <p className="text-xl font-semibold">{ticket.event.title}</p>
          <p className="text-light-100 text-sm">
            {formatEventDate(ticket.event.date)} at {ticket.event.time} ({ticket.event.timezone})
            <br />
            {ticket.event.venue}, {ticket.event.location}
          </p>
        </div>
      ) : (
        <p className="text-red-400">This ticket&apos;s event no longer exists.</p>
      )}

      <p className="text-sm">
        <strong className="font-mono">{ticket.ticketId}</strong>
        <br />
        {ticket.email}
      </p>

      {used && ticket.checkedInAt && (
        <p className="rounded-md bg-red-500/20 px-4 py-3 text-lg font-bold text-red-400" role="alert">
          Already used on {formatCheckedIn(ticket.checkedInAt)}
        </p>
      )}
      {unconfirmed && <p className="font-semibold text-red-400">This booking was never confirmed.</p>}
      {over && <p className="font-semibold text-red-400">This ticket&apos;s event is over.</p>}

      {!used && !unconfirmed && !over && ticket.event && <CheckInPanel ticketId={ticket.ticketId} />}
    </div>
  )
}
