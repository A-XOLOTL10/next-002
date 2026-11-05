import { cacheLife, cacheTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Event, { type IEvent } from "@/database/event.model"
import type { ImageDisplay } from "@/database/event.constants"
import { toList } from "@/lib/utils"
import { EVENTS_TAG, eventTag } from "@/lib/cache-tags"

// Cached event reads, shared by pages and GET API routes. Visitors only ever get published
// events: drafts stay out of every query here.
//
// Why "use cache" here: events are read on every page view but only change when an
// admin creates, edits or deletes one, so each read is cached and repeat visits skip
// MongoDB. Those writes clear these entries by tag (see lib/events.service.ts), so
// changes show up immediately instead of waiting for the cache to expire.
//
// cacheLife("hours") is a safety net for changes made outside the app
// (e.g. editing a document in Atlas), which don't clear any tag.
//
// "Has it ended?" is never cached: pages and cards work it out from endsAt and hideAt
// at the moment they're viewed.
//
// Return values are plain objects with string _ids: cached values must be
// serializable, and Mongoose ObjectIds are class instances.

// What EventCard needs, as plain, serializable props (Client Components can't receive
// Mongoose ObjectIds or Dates).
export type EventCardData = {
  _id: string
  title: string
  image: string
  images: string[]
  imageDisplay: ImageDisplay
  slug: string
  location: string
  date: string
  time: string
  timezone: string
  endsAt?: string
  hideAt?: string
}

// Never sent to visitors or the public API: internal notes and everything a host gave only to our team
// (their contact, the safeguarding contact, the signed letter, review notes, who owns the event).
const PUBLIC_EXCLUDE = "-importNotes -source -__v -ownerId -hostContact -safeguardingContact -authorizationLetterId -review -approvedSnapshotHash -cancelReason"

const CARD_FIELDS = "title image images imageDisplay slug location date time timezone endsAt hideAt"
const SIMILAR_EVENTS_LIMIT = 6

type CardSource = Pick<IEvent, "title" | "image" | "images" | "imageDisplay" | "slug" | "location" | "date" | "time" | "timezone" | "endsAt" | "hideAt"> & {
  _id: { toString(): string }
}

const toCard = (event: CardSource): EventCardData => ({
  _id: event._id.toString(),
  title: event.title,
  image: event.image,
  images: event.images,
  imageDisplay: event.imageDisplay,
  slug: event.slug,
  location: event.location,
  date: event.date,
  time: event.time,
  timezone: event.timezone,
  endsAt: event.endsAt?.toISOString(),
  hideAt: event.hideAt?.toISOString(),
})

/**
 * Every event visitors can see, soonest first: the closest event is the most important.
 * Events hidden after their end day drop out here, and pages filter again when they render.
 */
export async function getEventCards(): Promise<EventCardData[]> {
  "use cache"
  cacheLife("hours")
  cacheTag(EVENTS_TAG) // cleared when an event is published, edited or deleted

  await connectDB()
  const events = await Event.find({ status: "published", hideAt: { $gt: new Date() } })
    .sort({ startsAt: 1 })
    .select(CARD_FIELDS)
    .lean()

  return events.map(toCard)
}

/** Published events with every public field, soonest first (GET /api/events). */
export async function getAllEvents() {
  "use cache"
  cacheLife("hours")
  cacheTag(EVENTS_TAG) // cleared when an event is published, edited or deleted

  await connectDB()
  const events = await Event.find({ status: "published", hideAt: { $gt: new Date() } })
    .sort({ startsAt: 1 })
    .select(PUBLIC_EXCLUDE)
    .lean()

  return events.map(toPublicEvent)
}

/**
 * Plain, public JSON: string _id, and sponsors reduced to the names our team confirmed (their ids
 * are internal, and cached values can't hold ObjectId instances).
 */
function toPublicEvent<T extends { _id: { toString(): string }; sponsors?: { name: string; confirmed: boolean }[] }>(event: T) {
  return { ...event, _id: event._id.toString(), sponsors: (event.sponsors ?? []).filter((s) => s.confirmed).map((s) => ({ name: s.name })) }
}

/** One published event by slug, or null. Callers decide whether it's still visible (hideAt). */
export async function getEventBySlug(slug: string) {
  "use cache"
  cacheLife("hours")
  // Tagged per slug: a "not found" result is cached too, so publishing an event with
  // this slug must clear it (done in lib/events.service.ts).
  cacheTag(eventTag(slug))

  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase(), status: "published" })
    .select(PUBLIC_EXCLUDE)
    .lean()
  if (!event) return null

  return toPublicEvent(event)
}

/**
 * Other events sharing at least one tag with the event at `slug`, soonest first ([] if none).
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

  const similar = await Event.find({
    _id: { $ne: event._id },
    status: "published",
    hideAt: { $gt: new Date() },
    tags: { $in: toList(event.tags) },
  })
    .sort({ startsAt: 1 })
    .select(CARD_FIELDS)
    .limit(SIMILAR_EVENTS_LIMIT)
    .lean()

  return similar.map(toCard)
}
