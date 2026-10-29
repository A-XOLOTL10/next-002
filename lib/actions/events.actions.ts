import { cacheLife, cacheTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Event from "@/database/event.model"
import { toList } from "@/lib/utils"
import { EVENTS_TAG, eventTag } from "@/lib/cache-tags"

// Cached event reads, shared by pages and GET API routes.
//
// Why "use cache" here: events are read on every page view but only change when an
// admin creates, edits or deletes one, so each read is cached and repeat visits skip
// MongoDB. Those writes clear these entries by tag (see lib/events.service.ts), so
// changes show up immediately instead of waiting for the cache to expire.
//
// cacheLife("hours") is a safety net for changes made outside the app
// (e.g. editing a document in Atlas), which don't clear any tag.
//
// Return values are plain objects with string _ids: cached values must be
// serializable, and Mongoose ObjectIds are class instances.

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

/**
 * Every event as card data, soonest date first. Pages split it into upcoming and past
 * themselves, so this one cached list serves both and stays valid as days go by.
 */
export async function getEventCards(): Promise<EventCardData[]> {
  "use cache"
  cacheLife("hours")
  cacheTag(EVENTS_TAG) // cleared when an event is created, edited or deleted

  await connectDB()
  const events = await Event.find()
    .sort({ date: 1, time: 1 })
    .select("title image slug location date time")
    .lean()

  return events.map(({ _id, title, image, slug, location, date, time }) => ({
    _id: _id.toString(),
    title,
    image,
    slug,
    location,
    date,
    time,
  }))
}

/** All events with every field, newest first (GET /api/events). */
export async function getAllEvents() {
  "use cache"
  cacheLife("hours")
  cacheTag(EVENTS_TAG) // cleared when an event is created, edited or deleted

  await connectDB()
  const events = await Event.find().sort({ createdAt: -1 }).lean()

  return events.map((event) => ({ ...event, _id: event._id.toString() }))
}

/** One event by slug, or null if it doesn't exist. */
export async function getEventBySlug(slug: string) {
  "use cache"
  cacheLife("hours")
  // Tagged per slug: a "not found" result is cached too, so creating an event with
  // this slug must clear it (done in POST /api/events).
  cacheTag(eventTag(slug))

  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase() }).lean()
  if (!event) return null

  return { ...event, _id: event._id.toString() }
}

/**
 * Other events sharing at least one tag with the event at `slug` ([] if none).
 * Throws on database errors rather than returning [], so a brief outage isn't
 * cached as "no similar events" for hours; callers decide how to degrade.
 */
export async function getSimilarEventsBySlug(slug: string): Promise<EventCardData[]> {
  "use cache"
  cacheLife("hours")
  cacheTag(EVENTS_TAG) // a new event may be similar to this one

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
}
