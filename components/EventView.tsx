import type { ReactNode } from "react"
import Image from "next/image"
import EventImages from "@/components/EventImages"
import type { ImageDisplay } from "@/database/event.constants"
import { formatEventDate, formatEventTime, toList } from "@/lib/utils"

/** The fields this view shows. Optional ones can be missing on drafts. */
export type EventViewData = {
  title: string
  description?: string
  overview?: string
  images: string[]
  imageDisplay: ImageDisplay
  date?: string
  time?: string
  endDate?: string
  endTime?: string
  timezone: string
  venue?: string
  location?: string
  mode?: string
  audience?: string
  agenda: string[]
  tags: string[]
  organizer?: string
}

const EventDetailItem = ({ icon, alt, label }: { icon: string; alt: string; label?: string }) => (
  <div className="flex-row-gap-2 items-center">
    <Image src={icon} alt={alt} width={17} height={17} className="size-[17px]" />
    <p>{label || "Not set"}</p>
  </div>
)

const EventAgenda = ({ agendaItems }: { agendaItems: string[] }) => (
  <div className="agenda">
    <h2>Event Agenda</h2>
    <ul>
      {/* Items can repeat (two "Coffee break"s), so the position keeps keys unique. */}
      {agendaItems.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  </div>
)

const EventTags = ({ tags }: { tags: string[] }) => (
  <div className="flex flex-row flex-wrap gap-1.5">
    {tags.map((tag) => (
      <div key={tag} className="pill">
        {tag}
      </div>
    ))}
  </div>
)

/** "Saturday, 28 November 2026" or a range for multi-day events. */
function describeDate({ date, endDate }: EventViewData): string | undefined {
  if (!date) return undefined
  return endDate && endDate !== date ? `${formatEventDate(date)} to ${formatEventDate(endDate)}` : formatEventDate(date)
}

/** "17:00 to 20:00 (Africa/Lagos)" */
function describeTime({ time, endTime, timezone }: EventViewData): string | undefined {
  if (!time) return undefined
  return `${time}${endTime ? ` to ${endTime}` : ""} (${timezone})`
}

/**
 * An event's full details. The public page and the admin preview both render this, so a
 * preview shows exactly what visitors will see. `aside` is the booking card, `endedAt` marks
 * the event as over, and `children` go underneath (similar events).
 */
const EventView = ({
  event,
  aside,
  endedAt,
  children,
}: {
  event: EventViewData
  aside: ReactNode
  endedAt?: Date
  children?: ReactNode
}) => {
  const { title, description, overview, images, imageDisplay, mode, location, audience, organizer, venue, timezone } = event
  const agenda = toList(event.agenda)
  const tags = toList(event.tags)

  return (
    <div className={endedAt ? "event-ended" : undefined}>
      {endedAt && (
        <p className="ended-banner" role="status">
          &#9888; This event has ended. It ended at {formatEventTime(endedAt, timezone)} on {describeDate({ ...event, date: event.endDate || event.date, endDate: undefined })}.
        </p>
      )}

      <div className="header">
        <h1>{title}</h1>
        <p>{description}</p>
      </div>

      <div className="details">
        {/* {Left side} */}
        <div className="content">
          <div className="banner">
            <EventImages
              images={images}
              display={endedAt ? "static" : imageDisplay}
              title={title}
              controls
              preload
              sizes="(max-width: 1024px) 100vw, 66vw"
            />
          </div>

          <section className="flex-col-gap-2">
            <h2>Event Overview</h2>
            <p>{overview}</p>
          </section>

          <section className="flex-col-gap-2">
            <h2>Event Details</h2>

            <EventDetailItem icon="/icons/calendar.svg" alt="calendar" label={describeDate(event)} />
            <EventDetailItem icon="/icons/clock.svg" alt="clock" label={describeTime(event)} />
            <EventDetailItem icon="/icons/pin.svg" alt="location" label={[venue, location].filter(Boolean).join(", ")} />
            <EventDetailItem icon="/icons/mode.svg" alt="mode" label={mode} />
            <EventDetailItem icon="/icons/audience.svg" alt="audience" label={audience} />
          </section>

          {agenda.length > 0 && <EventAgenda agendaItems={agenda} />}

          <section className="flex-col-gap-2">
            <h2>About the Organiser</h2>
            <p>{organizer}</p>
          </section>

          <EventTags tags={tags} />
        </div>

        {/* {Right side} */}
        <aside className="booking">{aside}</aside>
      </div>

      {children}
    </div>
  )
}

export default EventView
