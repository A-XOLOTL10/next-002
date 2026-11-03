import EventCard from "@/components/EventCard"
import type { EventCardData } from "@/lib/actions/events.actions"
import type { EventItem } from "@/lib/constants"

export type EventListItem = EventItem & Partial<EventCardData>

/** Grid of event cards, or `emptyText` when there are none. */
const EventList = ({ events, emptyText }: { events: EventListItem[]; emptyText: string }) => {
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

/**
 * The order and filter every visitor list uses: hidden events go, and events still to come
 * show first, closest at the top. Events that ended today stay, at the end, until midnight.
 */
export function visibleEvents(events: EventListItem[]): EventListItem[] {
  const now = Date.now()
  const isOver = (event: EventListItem) => Boolean(event.endsAt) && new Date(event.endsAt as string).getTime() <= now

  return events
    .filter((event) => !event.hideAt || new Date(event.hideAt).getTime() > now)
    .toSorted((a, b) => Number(isOver(a)) - Number(isOver(b)))
}

export default EventList
