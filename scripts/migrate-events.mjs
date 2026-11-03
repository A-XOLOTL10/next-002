// One-off upgrade for events created before drafts, sliders and end times existed.
// Safe to re-run: events already upgraded are left alone. Nothing is deleted.
//
// Usage: npm run migrate      (reads MONGODB_URI / MONGODB_DB from .env.local)

import mongoose from "mongoose"
import { computeEventTimes } from "../database/event-time.ts"
import { DEFAULT_TIMEZONE } from "../database/event.constants.ts"

const DEFAULT_DURATION_HOURS = 3

/** Older events stored a list as one JSON string; unpack it. */
function toList(items = []) {
  if (items.length === 1 && items[0].trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(items[0])
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // Not JSON after all: keep it as it is.
    }
  }
  return items
}

/** Older events have no end time, so assume a few hours, stopping before midnight. */
function defaultEndTime(time) {
  const hours = Math.min(Number(time.split(":")[0]) + DEFAULT_DURATION_HOURS, 23)
  return `${String(hours).padStart(2, "0")}:${hours === 23 ? "59" : time.split(":")[1]}`
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run with: npm run migrate")
  process.exit(1)
}

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB ?? "dev-events",
    serverSelectionTimeoutMS: 10_000,
  })
  const events = mongoose.connection.collection("events")

  let upgraded = 0
  for (const event of await events.find({ status: { $exists: false } }).toArray()) {
    const timezone = event.timezone ?? DEFAULT_TIMEZONE
    const endTime = event.endTime ?? defaultEndTime(event.time)

    await events.updateOne(
      { _id: event._id },
      {
        $set: {
          status: "published", // these were already public
          publishedAt: event.createdAt ?? new Date(),
          source: "manual",
          importNotes: [],
          images: event.images ?? (event.image ? [event.image] : []),
          imageDisplay: event.imageDisplay ?? "static",
          timezone,
          endTime,
          agenda: toList(event.agenda),
          tags: toList(event.tags),
          ...computeEventTimes({ date: event.date, time: event.time, endDate: event.endDate, endTime, timezone }),
        },
      },
    )
    upgraded++
    console.log(`Upgraded: ${event.title} (${event.date})`)
  }

  console.log(`Done. ${upgraded} event(s) upgraded.`)
} catch (e) {
  console.error("Migration failed:", e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
