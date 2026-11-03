// Pure date helpers, with no imports, so the seed and migration scripts can use them too.
//
// Events store a local date and time plus a timezone, because that's how organizers write
// them. These helpers turn that into exact moments, which is what "has it ended?" needs:
//   startsAt  when it begins
//   endsAt    when it finishes (visitors see "ended" from here)
//   hideAt    midnight after the end date, in the event's timezone (gone from visitor pages)

export type EventTimeInput = {
  date: string // YYYY-MM-DD
  time: string // HH:mm
  endDate?: string // YYYY-MM-DD; defaults to `date`
  endTime?: string // HH:mm
  timezone: string // IANA, e.g. Africa/Lagos
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

/** How far ahead of UTC `timezone` is at `instant`, in milliseconds. */
function offsetMs(instant: number, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant))

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"))
  return asIfUtc - Math.floor(instant / 1000) * 1000
}

/** The exact moment a local date and time happens in `timezone`. */
export function zonedToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = time.split(":").map(Number)
  const wallClock = Date.UTC(year, month - 1, day, hours, minutes)

  // The offset depends on the moment itself (daylight saving), so refine the guess once.
  const firstGuess = wallClock - offsetMs(wallClock, timezone)
  return new Date(wallClock - offsetMs(firstGuess, timezone))
}

/** "2026-12-31" -> "2027-01-01" */
function nextDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

/** The exact moments for an event. endsAt and hideAt need an end time; drafts may not have one yet. */
export function computeEventTimes({ date, time, endDate, endTime, timezone }: EventTimeInput): {
  startsAt: Date
  endsAt?: Date
  hideAt?: Date
} {
  const startsAt = zonedToUtc(date, time, timezone)
  if (!endTime) return { startsAt }

  const lastDay = endDate || date
  return {
    startsAt,
    endsAt: zonedToUtc(lastDay, endTime, timezone),
    hideAt: zonedToUtc(nextDay(lastDay), "00:00", timezone),
  }
}
