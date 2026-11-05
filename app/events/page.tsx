import { Suspense } from "react"
import type { Metadata } from "next"
import { connection } from "next/server"
import EventList, { EventListSkeleton, visibleEvents } from "@/components/EventList"
import { getEventCards } from "@/lib/actions/events.actions"
import LiveRefresh from "@/components/LiveRefresh"

export const metadata: Metadata = {
  title: "All Events | DevEvent",
  description: "Upcoming developer events on DevEvent, soonest first.",
}

// Like the homepage: the heading is prerendered, the list renders at request time.
export default function EventsPage() {
  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1>All Events</h1>
        <p className="text-light-100">Free developer events, soonest first. Pick one and book your spot with just your email.</p>
      </div>

      <Suspense fallback={<EventListSkeleton />}>
        <AllEvents />
      </Suspense>
    </section>
  )
}

async function AllEvents() {
  // See app/page.tsx: never at build time, but the read itself is cached.
  await connection()
  const events = await getEventCards()

  return (
    <>
      <EventList events={visibleEvents(events)} emptyText="No upcoming events right now. Check back soon!" />
      <LiveRefresh />
    </>
  )
}
