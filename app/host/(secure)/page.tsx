import CloudImage from "@/components/CloudImage"
import Link from "next/link"
import HostNav from "@/components/host/HostNav"
import VerificationStatusCard from "@/components/host/VerificationStatusCard"
import { requireHost } from "@/lib/auth"
import { getHostProfile } from "@/lib/host.service"
import { getHostEvents } from "@/lib/host-events.service"
import { EVENT_STATUS_LABELS } from "@/database/event.constants"
import { hasEnded } from "@/lib/utils"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const NOTICES: Record<string, string> = {
  submitted: "Your event was sent for review. We'll email you when it's live or if anything needs changing.",
  revision: "Your changes were sent for review. Visitors keep seeing the current version until they're approved.",
  cancelled: "The event was cancelled and everyone who booked has been emailed.",
  deleted: "The draft was deleted.",
}

const STATUS_STYLE: Record<string, string> = {
  published: "text-green-400",
  in_review: "text-amber-400",
  changes_requested: "text-amber-400",
  rejected: "text-red-400",
  cancelled: "text-red-400",
  draft: "text-light-200",
}

// The host's home: verification status, their events, and how many people booked each one.
// Admins who open /host are sent to the console by requireHost().
export default async function HostDashboard({ searchParams }: PageProps<"/host">) {
  const session = await requireHost()
  const [profile, events, params] = await Promise.all([getHostProfile(session.user.id), getHostEvents(session.user.id), searchParams])
  const approved = profile?.status === "approved"
  const notice = typeof params.notice === "string" ? NOTICES[params.notice] : undefined

  return (
    <>
      <HostNav />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold">Your events</h1>
          <p className="text-light-100 text-sm">Bookings count only people who confirmed their email, so these are real attendees.</p>
        </div>
        {approved ? (
          <Link href="/host/events/new" className="admin-button">+ Create event</Link>
        ) : (
          <span className="text-light-200 text-sm">You can create events once you&apos;re verified.</span>
        )}
      </div>

      {notice && <p className="rounded-md border border-green-400/40 px-4 py-3 text-sm text-green-400" role="status">{notice}</p>}

      {!approved && <VerificationStatusCard profile={profile} />}

      {events.length === 0 ? (
        approved && <p className="text-light-100">No events yet. <Link href="/host/events/new" className="text-primary underline">Create your first one</Link>.</p>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => {
            const ended = hasEnded(event.endsAt)
            return (
              <div key={event.slug} className="bg-dark-100 border-dark-200 flex flex-wrap gap-4 rounded-[10px] border p-4">
                <div className="bg-dark-200 relative h-[90px] w-[160px] shrink-0 overflow-hidden rounded-md">
                  {event.image && (
                    <CloudImage src={event.image} alt="" fill sizes="160px" className="object-cover" />
                  )}
                </div>
                <div className="flex min-w-56 flex-1 flex-col gap-1">
                  <p className="text-lg font-semibold">{event.title}</p>
                  <p className="text-light-200 text-sm">{[event.date, event.location].filter(Boolean).join(" · ") || "No date yet"}</p>
                  <p className={`text-sm font-semibold ${STATUS_STYLE[event.status] ?? ""}`}>
                    {ended && event.status === "published" ? "Ended" : EVENT_STATUS_LABELS[event.status]}
                    {event.pendingRevision && <span className="text-amber-400"> · changes waiting for review</span>}
                  </p>
                  {event.reviewReason && (event.status === "changes_requested" || event.status === "rejected") && (
                    <p className="notice mt-1">Note from our team: {event.reviewReason}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-4 text-sm">
                    {event.status === "published" && <Link href={`/events/${event.slug}`} className="hover:underline">View live page</Link>}
                    {event.status === "published" && !ended && (
                      <Link href={`/host/events/${event.slug}/guests`} className="font-semibold hover:underline">VIP guests &amp; door tags</Link>
                    )}
                    {event.status !== "cancelled" && event.status !== "in_review" && !ended && (
                      <Link href={`/host/events/${event.slug}/edit`} className="font-semibold hover:underline">
                        {event.status === "published" ? "Propose changes" : "Edit"}
                      </Link>
                    )}
                  </div>
                </div>
                {(event.status === "published" || event.status === "cancelled") && (
                  <div className="flex gap-6 text-center">
                    <div>
                      <p className="text-primary text-2xl font-bold">{event.confirmed}</p>
                      <p className="text-light-200 text-xs">booked</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{event.checkedIn}</p>
                      <p className="text-light-200 text-xs">checked in</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
