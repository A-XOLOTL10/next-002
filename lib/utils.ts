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

/** Today's date as YYYY-MM-DD (UTC), the same format events store their date in. */
export const todayISODate = (): string => new Date().toISOString().slice(0, 10)

/** True once an event's date (YYYY-MM-DD) is before today. Events stay bookable on the day itself. */
export const isPastEvent = (date: string): boolean => date < todayISODate()

/** "2026-11-09" -> "Monday, 9 November 2026". Formatted in UTC so the day never shifts by timezone. */
export const formatEventDate = (date: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))
