// Why "use cache" on the whole page: like the homepage, it uses no request-time data,
// so it's prerendered and served from cache, refreshed when an event changes.
"use cache"

import type { Metadata } from "next"
import { cacheLife, cacheTag } from "next/cache"
import EventList from "@/components/EventList"
import { events as bundledEvents, type EventItem } from "@/lib/constants"
import { getEventCards } from "@/lib/actions/events.actions"
import { EVENTS_TAG } from "@/lib/cache-tags"
import { todayISODate } from "@/lib/utils"

export const metadata: Metadata = {
  title: "All Events | DevEvent",
  description: "Every upcoming and past developer event on DevEvent.",
}

export default async function EventsPage() {
  cacheLife("hours")
  cacheTag(EVENTS_TAG)

  const events: (EventItem & { _id?: string })[] = process.env.MONGODB_URI ? await getEventCards() : bundledEvents

  // Frozen into this cache entry (rebuilt at least hourly), see app/page.tsx.
  const today = todayISODate()
  const upcoming = events.filter((event) => event.date >= today) // soonest first
  const past = events.filter((event) => event.date < today).reverse() // most recent first

  return (
    <section className="flex flex-col gap-16">
      <div className="flex flex-col gap-3">
        <h1>All Events</h1>
        <p className="text-light-100">Free developer events. Pick one and book your spot with just your email.</p>
      </div>

      <div className="flex flex-col gap-7">
        <h3>Upcoming ({upcoming.length})</h3>
        <EventList events={upcoming} emptyText="No upcoming events right now. Check back soon!" />
      </div>

      {past.length > 0 && (
        <div className="flex flex-col gap-7 opacity-80">
          <h3>Past Events ({past.length})</h3>
          <EventList events={past} emptyText="" />
        </div>
      )}
    </section>
  )
}
