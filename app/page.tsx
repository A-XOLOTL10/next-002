import { Suspense } from "react"
import Link from "next/link"
import { connection } from "next/server"
import ExploreBtn from "@/components/ExploreBtn"
import EventList, { EventListSkeleton, visibleEvents } from "@/components/EventList"
import { getEventCards } from "@/lib/actions/events.actions"
import LiveRefresh from "@/components/LiveRefresh"

const FEATURED_LIMIT = 6

// The heading is prerendered at build time; the events list reads MongoDB, so it renders
// at request time behind <Suspense>. The build never connects to the database (it may
// not be reachable from the build machine at all).
const page = () => {
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

        <Suspense fallback={<EventListSkeleton />}>
          <FeaturedEvents />
        </Suspense>
      </div>
    </section>
  )
}

async function FeaturedEvents() {
  // Request time only. The read itself is still cached (see getEventCards), so most visits
  // skip MongoDB, and publishing, editing or deleting an event clears it.
  // Database errors propagate to app/error.tsx (and are never cached).
  await connection()
  const events = await getEventCards()

  return (
    <>
      <EventList
        events={visibleEvents(events).slice(0, FEATURED_LIMIT)}
        emptyText="No upcoming events right now. Check back soon!"
      />
      {/* New or changed events appear without a reload. */}
      <LiveRefresh />
    </>
  )
}

export default page
