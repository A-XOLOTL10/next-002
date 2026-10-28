import { cacheLife, cacheTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Event from "@/database/event.model"
import { toList } from "@/lib/utils"

// Only the fields EventCard renders, with _id as a string: Client Components
// can only receive plain, serializable props (not Mongoose ObjectIds).
export type EventCardData = {
  _id: string
  title: string
  image: string
  slug: string
  location: string
  date: string
  time: string
}

const SIMILAR_EVENTS_LIMIT = 6

/** Other events sharing at least one tag with the event at `slug`. Returns [] if none or on failure. */
export async function getSimilarEventsBySlug(slug: string): Promise<EventCardData[]> {
  "use cache"
  cacheLife("minutes")
  cacheTag("events")

  try {
    await connectDB()

    const event = await Event.findOne({ slug: slug.toLowerCase() }).select("tags").lean()
    if (!event) return []

    const similar = await Event.find({ _id: { $ne: event._id }, tags: { $in: toList(event.tags) } })
      .select("title image slug location date time")
      .limit(SIMILAR_EVENTS_LIMIT)
      .lean()

    return similar.map(({ _id, title, image, slug, location, date, time }) => ({
      _id: _id.toString(),
      title,
      image,
      slug,
      location,
      date,
      time,
    }))
  } catch (e) {
    // Similar events are optional: log and render the page without them.
    console.error("Failed to load similar events:", e)
    return []
  }
}
