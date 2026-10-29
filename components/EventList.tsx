import EventCard from "@/components/EventCard"
import type { EventItem } from "@/lib/constants"

/** Grid of event cards, or `emptyText` when there are none. */
const EventList = ({ events, emptyText }: { events: (EventItem & { _id?: string })[]; emptyText: string }) => {
  if (events.length === 0) return <p className="text-light-200">{emptyText}</p>

  return (
    <ul className="events">
      {events.map((event) => (
        // Unique per event (titles can repeat); slug is unique too, for bundled samples without an _id.
        <li className="list-none" key={event._id ?? event.slug}>
          <EventCard {...event} />
        </li>
      ))}
    </ul>
  )
}

export default EventList
