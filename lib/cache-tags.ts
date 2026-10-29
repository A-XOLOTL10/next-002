// Cache tags shared by cached reads (cacheTag) and the writes that invalidate them
// (updateTag/revalidateTag). Keeping them in one place stops readers and writers drifting apart.

/** Every cached list of events: homepage, GET /api/events, similar events. */
export const EVENTS_TAG = "events"

/** One event's details, by slug. */
export const eventTag = (slug: string) => `event-${slug.toLowerCase()}`

/** One event's booking count. */
export const bookingsTag = (eventId: string) => `bookings-${eventId}`
