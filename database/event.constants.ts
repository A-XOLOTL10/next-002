// Kept apart from event.model.ts so Client Components (e.g. the admin event form) can
// import these without pulling Mongoose into the browser bundle.
export const EVENT_MODES = ["online", "offline", "hybrid"] as const
export type EventMode = (typeof EVENT_MODES)[number]

/** "draft" events are invisible to visitors until an admin previews and publishes them. */
export const EVENT_STATUSES = ["draft", "published"] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

/** Where an event came from: the admin form/API, or the AI import. */
export const EVENT_SOURCES = ["manual", "ai-import"] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

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
