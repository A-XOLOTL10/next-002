// Adds (or refreshes) two sample events dated in the future, so there's always something
// open to book while testing. Safe to re-run: it only touches these two slugs, and moves
// their dates forward again each time.
//
// Usage: npm run seed      (reads MONGODB_URI / MONGODB_DB from .env.local)

import mongoose from "mongoose"

const daysFromToday = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

const SAMPLE_EVENTS = [
  {
    title: "Open Source Builders Meetup",
    slug: "open-source-builders-meetup",
    description: "An evening of lightning talks and hands-on contribution sprints for open source maintainers and first-time contributors.",
    overview:
      "Meet maintainers from popular JavaScript and Python projects, learn how to find good first issues, and pair up to land your first pull request. Laptops encouraged; snacks provided.",
    image: "/images/event1.png",
    venue: "Co-Creation Hub",
    location: "Lagos, Nigeria",
    date: daysFromToday(30),
    time: "17:00",
    mode: "hybrid",
    audience: "Developers of all levels, open source maintainers, students",
    agenda: [
      "05:00 PM - 05:30 PM | Welcome & networking",
      "05:30 PM - 06:30 PM | Lightning talks: maintaining projects at scale",
      "06:30 PM - 08:00 PM | Contribution sprint in small groups",
    ],
    organizer: "The DevEvent community team runs free meetups for developers to learn, share and build together.",
    tags: ["Open Source", "JavaScript", "Python", "Community"],
  },
  {
    title: "Cloud Native Workshop",
    slug: "cloud-native-workshop",
    description: "A practical, beginner-friendly workshop on containers, Kubernetes and deploying your first app to the cloud.",
    overview:
      "Go from a local app to a running deployment: build a container image, run it on Kubernetes, and set up a simple CI pipeline. Every step is hands-on, with mentors in the room and online.",
    image: "/images/event2.png",
    venue: "Online (link sent after booking)",
    location: "Online",
    date: daysFromToday(60),
    time: "10:00",
    mode: "online",
    audience: "Backend developers, DevOps beginners, students",
    agenda: [
      "10:00 AM - 10:30 AM | Containers in 30 minutes",
      "10:30 AM - 12:00 PM | Hands-on: deploy to Kubernetes",
      "12:00 PM - 12:30 PM | CI/CD basics & Q&A",
    ],
    organizer: "The DevEvent community team runs free meetups for developers to learn, share and build together.",
    tags: ["Cloud", "Kubernetes", "DevOps", "Docker"],
  },
]

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

  for (const event of SAMPLE_EVENTS) {
    const now = new Date()
    const { upsertedCount } = await events.updateOne(
      { slug: event.slug },
      { $set: { ...event, updatedAt: now }, $setOnInsert: { createdAt: now, __v: 0 } },
      { upsert: true },
    )
    console.log(`${upsertedCount ? "Created" : "Refreshed"}: ${event.title} on ${event.date} -> /events/${event.slug}`)
  }
  // Writing directly to the database bypasses the app's cache invalidation, so a running
  // server may show its cached event list for up to an hour.
  console.log("Done. Restart `npm run dev` (or `npm start`) to see these events immediately.")
} catch (e) {
  console.error("Seeding failed:", e instanceof Error ? e.message : e)
  process.exitCode = 1
} finally {
  await mongoose.disconnect()
}
