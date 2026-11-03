export { cn } from "cn"

// Events saved through form-data may store a list as one JSON string ('["a","b"]');
// accept that as well as a real array.
export const toList = (items: string[]): string[] => {
  if (items.length === 1 && items[0].trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(items[0])
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // Not JSON after all; fall through and show it as-is.
    }
  }
  return items
}

/** The shape the Event model's slugify() produces: lowercase words joined by single hyphens. */
export const isValidSlug = (slug: string): boolean => slug.length <= 200 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)

type Moment = Date | string | null | undefined

/** True once the event has finished. Bookings close and pages show "ended" from this moment. */
export const hasEnded = (endsAt: Moment): boolean => Boolean(endsAt) && new Date(endsAt as Date | string).getTime() <= Date.now()

/** True from midnight after the event's last day: visitors no longer see it at all. */
export const isHiddenFromVisitors = (hideAt: Moment): boolean => Boolean(hideAt) && new Date(hideAt as Date | string).getTime() <= Date.now()

/** "5:00 PM GMT+1", in the event's own timezone. */
export const formatEventTime = (moment: Date | string, timezone: string): string =>
  new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: timezone }).format(new Date(moment)) +
  " " +
  (new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "short" })
    .formatToParts(new Date(moment))
    .find((part) => part.type === "timeZoneName")?.value ?? "")

/** "2026-11-09" -> "Monday, 9 November 2026". Formatted in UTC so the day never shifts by timezone. */
export const formatEventDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))

/** "2026-11-09" -> "9 Nov 2026", for event cards. */
export const formatShortDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
