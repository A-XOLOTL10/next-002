import { Suspense } from "react"
import { notFound } from "next/navigation"
import Image from "next/image"
import { cacheLife, cacheTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Event from "@/database/event.model"
import Booking from "@/database/booking.model"
import BookEvents from "@/components/BookEvents"
import { getSimilarEventsBySlug } from "@/lib/actions/events.actions"
import EventCard from "@/components/EventCard"
import { toList } from "@/lib/utils"



// Cached DB read: repeat visits skip MongoDB. Queried directly rather than via
// /api/events/[slug], which would add an HTTP hop and fail at build time.
async function getEventBySlug(slug: string) {
  "use cache"
  cacheLife("minutes")
  cacheTag(`event-${slug}`)

  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase() }).lean()
  if (!event) return null

  // ObjectId isn't serializable across the cache/RSC boundary; send it as a string.
  return { ...event, _id: event._id.toString() }
}

// Tagged so createBooking can refresh it immediately with updateTag().
async function getBookingCount(eventId: string) {
  "use cache"
  cacheLife("minutes")
  cacheTag(`bookings-${eventId}`)

  await connectDB()
  return Booking.countDocuments({ eventId })
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

  const { _id, description, image, overview, date, time, location, mode, agenda, audience, tags, organizer } = event

  const bookings = await getBookingCount(_id);

  const similarEvents = await getSimilarEventsBySlug(slug);

  return (
    <>
      <div className="header">
        <h1>Event Description</h1>
        <p>{description}</p>
      </div>

      <div className="details">


        {/* {Left side} */}

        <div className="content">
          <Image src={image} alt="Event" width={800} height={800} className="" />
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

            <BookEvents eventId={_id} />

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