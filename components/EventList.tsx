import EventCard from "@/components/EventCard"
import type { EventCardData } from "@/lib/actions/events.actions"
import type { EventItem } from "@/lib/constants"

export type EventListItem = EventItem & Partial<EventCardData>

/** Grid of event cards, or `emptyText` when there are none. */
const EventList = ({ events, emptyText }: { events: EventListItem[]; emptyText: string }) => {
  if (events.length === 0) return <p className="text-light-200">{emptyText}</p>

  return (
    <ul className="events">
      {events.map((event, index) => (
        // Unique per event (titles can repeat); slug is unique too, for bundled samples without an _id.
        <li className="list-none" key={event._id ?? event.slug}>
          {/* The first row (up to 3 cards) is above the fold on most screens: load those images first. */}
          <EventCard {...event} preload={index < 3} />
        </li>
      ))}
    </ul>
  )
}

/** Placeholder cards the same size as real ones, shown while the list loads (no layout shift). */
export const EventListSkeleton = ({ count = 3 }: { count?: number }) => (
  <ul className="events" aria-busy="true" aria-label="Loading events">
    {Array.from({ length: count }, (_, index) => (
      <li key={index} className="list-none flex flex-col gap-3">
        <div className="skeleton h-[300px] w-full" />
        <div className="skeleton h-4 w-1/2" />
        <div className="skeleton h-6 w-4/5" />
        <div className="skeleton h-4 w-2/3" />
      </li>
    ))}
  </ul>
)

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
