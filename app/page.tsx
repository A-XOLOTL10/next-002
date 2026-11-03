// Why "use cache" on the whole page: it uses no request-time data (no params,
// cookies or search params), so the full page, events included, can be
// prerendered and served from cache instead of querying MongoDB on every visit.
// (proxy.ts runs before the cache, so the first-visit redirect to the login page
// doesn't stop this page being static.)
"use cache"

import Link from "next/link"
import { cacheLife, cacheTag } from "next/cache"
import ExploreBtn from "@/components/ExploreBtn"
import EventList, { visibleEvents } from "@/components/EventList"
import { events as bundledEvents } from "@/lib/constants"
import { getEventCards } from "@/lib/actions/events.actions"
import { EVENTS_TAG } from "@/lib/cache-tags"

const FEATURED_LIMIT = 6

const page = async () => {
  // A short lifetime keeps the order right as events pass. Between rebuilds, each event card
  // works out "ended" and "hidden" for itself in the browser.
  cacheLife("minutes")
  // Tagged so publishing, editing or deleting an event refreshes the homepage right away.
  cacheTag(EVENTS_TAG)

  // Reads MongoDB directly instead of fetching our own /api/events: at build time
  // no server is running to answer that request, so a cached self-fetch can hang.
  // Without a database configured (e.g. CI builds), show the bundled sample events.
  // Database errors propagate to app/error.tsx (and are never cached).
  const events = process.env.MONGODB_URI ? await getEventCards() : bundledEvents

  return (
    <section>
      <h1 className="text-center">The Hub for Every Developers <br /> Event You Must Attend</h1>
      <p className="text-center mt-5">Hackathons, Greet & Meetups and Conferences. All in one place.</p>

      <ExploreBtn />

      <div id="events" className="mt-20 space-y-7 scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3>Upcoming Events</h3>
          <Link href="/events" className="text-sm hover:underline">See all events &rarr;</Link>
        </div>

        <EventList
          events={visibleEvents(events).slice(0, FEATURED_LIMIT)}
          emptyText="No upcoming events right now. Check back soon!"
        />
      </div>
    </section>
  )
}

export default page
