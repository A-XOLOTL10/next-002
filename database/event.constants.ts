// Kept apart from event.model.ts so Client Components (e.g. the admin event form) can
// import it without pulling Mongoose into the browser bundle.
export const EVENT_MODES = ["online", "offline", "hybrid"] as const
export type EventMode = (typeof EVENT_MODES)[number]
