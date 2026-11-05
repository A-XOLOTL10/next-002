// Kept apart from event.model.ts so Client Components (e.g. the admin event form) can
// import these without pulling Mongoose into the browser bundle.
export const EVENT_MODES = ["online", "offline", "hybrid"] as const
export type EventMode = (typeof EVENT_MODES)[number]

/**
 * Only "published" events are visible to visitors. The others:
 * - draft: being written (by an admin, or by a host before sending it for review)
 * - in_review: a host sent it; waiting for an admin to check it and contact the organizations
 * - changes_requested: the admin asked the host to fix something; the host edits and resends
 * - rejected: refused for good (the reason is recorded)
 * - cancelled: was live, then cancelled; everyone who booked was emailed
 */
export const EVENT_STATUSES = ["draft", "in_review", "changes_requested", "rejected", "published", "cancelled"] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  in_review: "Waiting for review",
  changes_requested: "Changes requested",
  rejected: "Rejected",
  published: "Live",
  cancelled: "Cancelled",
}

/** Statuses in which the host may still edit the event directly (live events go through a revision). */
export const HOST_EDITABLE_STATUSES: readonly EventStatus[] = ["draft", "changes_requested"]

/**
 * Who the event is for. Events open to under-18s need a public venue and a named safeguarding
 * contact, so young people are never drawn to a private or unverified place.
 */
export const AUDIENCE_AGES = ["adults", "all_ages", "under_18"] as const
export type AudienceAge = (typeof AUDIENCE_AGES)[number]
export const AUDIENCE_AGE_LABELS: Record<AudienceAge, string> = {
  adults: "Adults only (18+)",
  all_ages: "All ages (under-18s welcome)",
  under_18: "Mainly for under-18s (students, kids' coding)",
}

/** Where an event came from: the admin form/API, or the AI import. */
export const EVENT_SOURCES = ["manual", "ai-import"] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

/**
 * What kind of event it is. Hosts must choose one; it decides the design brief every AI image
 * for the event follows (lib/design-categories.ts), so designs stay consistent per category.
 */
export const EVENT_CATEGORIES = [
  "hackathon", "conference", "meetup", "workshop", "webinar", "bootcamp", "career", "launch", "corporate", "community",
] as const
export type EventCategory = (typeof EVENT_CATEGORIES)[number]

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  hackathon: "Hackathon",
  conference: "Conference or summit",
  meetup: "Meetup",
  workshop: "Workshop (hands-on)",
  webinar: "Webinar or online talk",
  bootcamp: "Bootcamp or training course",
  career: "Career fair or recruiting",
  launch: "Product launch, demo day or pitch",
  corporate: "Corporate event (offsite, partner day)",
  community: "Community, student or youth tech",
}

/** "static" shows the first image; "slider" rotates through all of them. */
export const IMAGE_DISPLAYS = ["static", "slider"] as const
export type ImageDisplay = (typeof IMAGE_DISPLAYS)[number]

/** Image rules, also sent to organizers in the event request form. */
export const IMAGE_RULES = {
  maxImages: 5,
  maxBytes: 5 * 1024 * 1024, // 5 MB each
  minWidth: 1200,
  minHeight: 675,
  recommended: "1600 x 900 pixels (16:9)",
  formats: "PNG, JPEG or WebP",
} as const

/** Used when an event doesn't name its own timezone. */
export const DEFAULT_TIMEZONE = "Africa/Lagos"

/** Fields an event must have before it can go live. Drafts may be missing any of these. */
export const REQUIRED_TO_PUBLISH = [
  "title", "description", "overview", "venue", "location", "date", "time", "endTime",
  "mode", "audience", "organizer", "agenda", "tags", "images",
] as const
