// Why "use cache" on the whole page: like the homepage, it uses no request-time data,
// so it's prerendered and served from cache, refreshed when an event changes.
"use cache"

import type { Metadata } from "next"
import { cacheLife, cacheTag } from "next/cache"
import EventList, { visibleEvents } from "@/components/EventList"
import { events as bundledEvents } from "@/lib/constants"
import { getEventCards } from "@/lib/actions/events.actions"
import { EVENTS_TAG } from "@/lib/cache-tags"

export const metadata: Metadata = {
  title: "All Events | DevEvent",
  description: "Upcoming developer events on DevEvent, soonest first.",
}

export default async function EventsPage() {
  // See app/page.tsx: rebuilt often, and each card keeps itself accurate between rebuilds.
  cacheLife("minutes")
  cacheTag(EVENTS_TAG)

  const events = process.env.MONGODB_URI ? await getEventCards() : bundledEvents

  return (
    <section className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <h1>All Events</h1>
        <p className="text-light-100">Free developer events, soonest first. Pick one and book your spot with just your email.</p>
      </div>

      <EventList events={visibleEvents(events)} emptyText="No upcoming events right now. Check back soon!" />
    </section>
  )
}
