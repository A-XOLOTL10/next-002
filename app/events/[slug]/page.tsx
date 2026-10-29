import { Suspense } from "react"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import Image from "next/image"
import { cacheLife, cacheTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import BookEvents from "@/components/BookEvents"
import { getEventBySlug, getSimilarEventsBySlug } from "@/lib/actions/events.actions"
import EventCard from "@/components/EventCard"
import { isPastEvent, toList } from "@/lib/utils"
import { bookingsTag } from "@/lib/cache-tags"

// Caching on this page:
// - The page itself is NOT cached: it awaits `params`, which is request-time data.
//   Wrapping that in "use cache" makes Next wait for data it can't get during
//   prerendering and time out (~50s). Instead, the slug is read inside <Suspense>.
// - Every database read IS cached (getEventBySlug, getSimilarEventsBySlug, and
//   getBookingCount below), so repeat visits to an event skip MongoDB.
// - The small display components (EventDetailItem, EventAgenda, EventTags) aren't
//   cached: they do no I/O, so caching them would add overhead and save nothing.

// Why "use cache": the count is shown on every visit but only changes when someone
// confirms a booking. confirmBooking clears this tag with updateTag(), so the booker sees the
// new count immediately. "minutes" bounds staleness for other visitors on
// serverless hosts, where each instance has its own in-memory cache.
async function getBookingCount(eventId: string) {
  "use cache"
  cacheLife("minutes")
  cacheTag(bookingsTag(eventId))

  await connectDB()
  // Only confirmed bookings count: pending ones haven't verified their email yet.
  return Booking.countDocuments({ eventId, status: "confirmed" })
}

// Past events can't be booked (the server rejects it too), so don't offer a form that can only fail.
// "Has it ended?" depends on today's date, which can't be baked into a prerendered page, so
// connection() makes just this small piece render at request time; the rest stays prerenderable.
async function BookingForm({ eventId, date }: { eventId: string; date: string }) {
  await connection()

  if (isPastEvent(date)) {
    return <p className="text-sm">This event has ended. Bookings are closed.</p>
  }
  return <BookEvents eventId={eventId} />
}

const EventDetailItem = ({ icon, alt, label }: { icon: string, alt: string, label: string }) => {

  return (

    <div className="flex-row-gap-2 items-center">
      <Image src={icon} alt={alt} width={17} height={17} />
      <p>{label}</p>
    </div>

  );

}

const EventAgenda = ({ agendaItems }: { agendaItems: string[] }) => {
  return (
    <div className="agenda">
      <h2>Event Agenda</h2>
      <ul>
        {agendaItems.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )

}

const EventTags = ({ tags }: { tags: string[] }) => {

  return (
    <div className="flex flex-row gap-1.5 flex-wrap">
      {tags.map((tag) => (
        <div key={tag} className="pill">
          {tag}
        </div>
      ))}
    </div>
  )


}



// The slug is request-time data, so it's read inside <Suspense> (see EventDetailsPage):
// the page shell renders instantly and the event details stream in.
const EventDetails = async ({ params }: Pick<PageProps<"/events/[slug]">, "params">) => {
  const { slug } = await params
  const event = await getEventBySlug(slug)

  if (!event) notFound()

  const { _id, title, description, image, overview, date, time, location, mode, agenda, audience, tags, organizer } = event

  const bookings = await getBookingCount(_id);

  // Similar events are optional: if the query fails, render the page without them.
  // Caught here, outside the cache, so the failure itself is never cached.
  const similarEvents = await getSimilarEventsBySlug(slug).catch((e: unknown) => {
    console.error("Failed to load similar events:", e)
    return []
  });

  return (
    <>
      <div className="header">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="details">


        {/* {Left side} */}

        <div className="content">
          <Image src={image} alt={title} width={800} height={457} className="banner" priority />
          <section className="flex-col-gap-2">
            <h2>Event Overview</h2>
            <p>{overview}</p>
          </section>

          <section className="flex-col-gap-2">
            <h2>Event Details</h2>

            <EventDetailItem icon="/icons/calendar.svg" alt="calendar" label={date} />
            <EventDetailItem icon="/icons/clock.svg" alt="clock" label={time} />
            <EventDetailItem icon="/icons/pin.svg" alt="location" label={location} />
            <EventDetailItem icon="/icons/mode.svg" alt="mode" label={mode} />
            <EventDetailItem icon="/icons/audience.svg" alt="audience" label={audience} />

          </section>

          <EventAgenda agendaItems={toList(agenda)} />

          <section className="flex-col-gap-2">
            <h2>About the Organiser</h2>
            <p>{organizer}</p>
          </section>

          <EventTags tags={toList(tags)} />

        </div>

        {/* {Right side} */}
        <aside className="booking">
          <div className="signup-card">
            <h2>Book Your Spot</h2>
            {
              bookings > 0 ? (
                <p className="text-sm">
                  Join {bookings} {bookings === 1 ? "person who has" : "people who have"} already booked their spot!
                </p>
              ) : (
                <p className="text-sm">
                  Be the first to book your spot!
                </p>
              )
            }

            <Suspense fallback={null}>
              <BookingForm eventId={_id} date={date} />
            </Suspense>

          </div>
        </aside>


      </div>

      <div className="flex w-full flex-col gap-4 pt-20">
        <h2> Similar Events </h2>
        <div className="events">

          {
            similarEvents.length > 0 && similarEvents.map((similarEvent) => (

              <EventCard key={similarEvent._id} {...similarEvent} />
            ))
          }
        </div>
      </div>
    </>
  )
}

const EventDetailsPage = ({ params }: PageProps<"/events/[slug]">) => {
  return (
    <section id="event">
      <Suspense fallback={<p>Loading event...</p>}>
        <EventDetails params={params} />
      </Suspense>
    </section>
  )
}

export default EventDetailsPage