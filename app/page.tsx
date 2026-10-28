"use cache"

import EventCard from "@/components/EventCard"
import ExploreBtn from "@/components/ExploreBtn"
import { events as bundledEvents, type EventItem } from "@/lib/constants"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL

const page = async () => {

  // Without a base URL (e.g. CI builds) there's no API to call; show the bundled sample events instead.
  // Events from the API carry a MongoDB _id; the bundled samples don't.
  let events: (EventItem & { _id?: string })[] = bundledEvents

  if (BASE_URL) {
    const resonse = await fetch(`${BASE_URL}/api/events`)

    // Surface API failures to app/error.tsx instead of rendering a silently empty list.
    if (!resonse.ok) throw new Error(`Failed to load events (HTTP ${resonse.status})`)

    events = (await resonse.json()).events ?? []
  }

  return (
    <section>
      <h1 className=" text-center">The Hub for Every Developers <br /> Event You Must Attend</h1>
      <p className="text-center mt-5">Hackathons, Greet & Meetups and Conferences. All in one place.</p>

      <ExploreBtn />

      <div className="mt-20 space-y-7">
    <h3>Featured Events</h3>

    <ul className="events">
      {
        events && events.length > 0 &&
        events.map((event) => (
          // Unique per event (titles can repeat); slug is unique too, for bundled samples without an _id.
          <li className="list-none"  key={event._id ?? event.slug}>
            <EventCard {...event} />
          </li>
        ))
      }
    </ul>
      </div>
    </section>
  )
}

export default page
