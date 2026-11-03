// Adds (or refreshes) sample events, so there's always something to test. Safe to re-run:
// it only touches these slugs, and moves their dates forward again each time.
//   - two open events, one with a slider and one with a static image
//   - one that ended earlier today, to show the crossed-out "ended" view until midnight
//
// Usage: npm run seed      (reads MONGODB_URI / MONGODB_DB from .env.local)

import mongoose from "mongoose"
import { computeEventTimes } from "../database/event-time.ts"
import { DEFAULT_TIMEZONE } from "../database/event.constants.ts"

const daysFromToday = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

/** The date and time `hoursAgo` hours ago, as they read on a clock in the default timezone. */
function localClock(hoursAgo) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(Date.now() - hoursAgo * 3_600_000))
  const get = (type) => parts.find((part) => part.type === type).value
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` }
}

const ORGANIZER = "The DevEvent community team runs free meetups for developers to learn, share and build together."

const OPEN_EVENTS = [
  {
    title: "Open Source Builders Meetup",
    slug: "open-source-builders-meetup",
    description: "An evening of lightning talks and hands-on contribution sprints for open source maintainers and first-time contributors.",
    overview:
      "Meet maintainers from popular JavaScript and Python projects, learn how to find good first issues, and pair up to land your first pull request. Laptops encouraged; snacks provided.",
    images: ["/images/event1.png", "/images/event3.png", "/images/event5.png"],
    imageDisplay: "slider",
    venue: "Co-Creation Hub",
    location: "Lagos, Nigeria",
    date: daysFromToday(30),
    time: "17:00",
    endTime: "20:00",
    mode: "hybrid",
    audience: "Developers of all levels, open source maintainers, students",
    agenda: [
      "05:00 PM - 05:30 PM | Welcome & networking",
      "05:30 PM - 06:30 PM | Lightning talks: maintaining projects at scale",
      "06:30 PM - 08:00 PM | Contribution sprint in small groups",
    ],
    organizer: ORGANIZER,
    tags: ["Open Source", "JavaScript", "Python", "Community"],
  },
  {
    title: "Cloud Native Workshop",
    slug: "cloud-native-workshop",
    description: "A practical, beginner-friendly workshop on containers, Kubernetes and deploying your first app to the cloud.",
    overview:
      "Go from a local app to a running deployment: build a container image, run it on Kubernetes, and set up a simple CI pipeline. Every step is hands-on, with mentors in the room and online.",
    images: ["/images/event2.png"],
    imageDisplay: "static",
    venue: "Online (link sent after booking)",
    location: "Online",
    date: daysFromToday(60),
    time: "10:00",
    endTime: "12:30",
    mode: "online",
    audience: "Backend developers, DevOps beginners, students",
    agenda: [
      "10:00 AM - 10:30 AM | Containers in 30 minutes",
      "10:30 AM - 12:00 PM | Hands-on: deploy to Kubernetes",
      "12:00 PM - 12:30 PM | CI/CD basics & Q&A",
    ],
    organizer: ORGANIZER,
    tags: ["Cloud", "Kubernetes", "DevOps", "Docker"],
  },
]

/** An event that ended an hour ago. Skipped just after midnight, when it would fall on yesterday. */
function endedTodayEvent() {
  const start = localClock(3)
  const end = localClock(1)
  if (start.date !== end.date || end.date !== localClock(0).date) return null

  return {
    title: "Frontend Lightning Talks",
    slug: "frontend-lightning-talks",
    description: "Sample event that ended earlier today, to show how ended events look until midnight.",
    overview: "Short talks on React, CSS and web performance.",
    images: ["/images/event4.png"],
    imageDisplay: "static",
    venue: "Co-Creation Hub",
    location: "Lagos, Nigeria",
    ...start,
    endTime: end.time,
    mode: "offline",
    audience: "Frontend developers",
    agenda: ["Talks", "Q&A"],
    organizer: ORGANIZER,
    tags: ["Frontend", "React", "CSS"],
  }
}

if (!process.env.MONGODB_URI) {
  console.error("MONGODB_URI is not set. Run with: npm run seed")
  process.exit(1)
}

try {
  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB ?? "dev-events",
    serverSelectionTimeoutMS: 10_000,
  })
  const events = mongoose.connection.collection("events")

  for (const event of [...OPEN_EVENTS, endedTodayEvent()].filter(Boolean)) {
    const now = new Date()
    const timezone = DEFAULT_TIMEZONE
    const { upsertedCount } = await events.updateOne(
      { slug: event.slug },
      {
        $set: {
          ...event,
          image: event.images[0],
          timezone,
          status: "published",
          source: "manual",
          importNotes: [],
          publishedAt: now,
          updatedAt: now,
          ...computeEventTimes({ ...event, timezone }),
        },
        $setOnInsert: { createdAt: now, __v: 0 },
      },
      { upsert: true },
    )
    console.log(`${upsertedCount ? "Created" : "Refreshed"}: ${event.title} on ${event.date} -> /events/${event.slug}`)
  }

  // Writing directly to the database bypasses the app's cache invalidation, so a running
  // server may show its cached event list for a while.
  console.log("Done. Restart `npm run dev` (or `npm start`) to see these events immediately.")
} catch (e) {
  console.error("Seeding failed:", e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
