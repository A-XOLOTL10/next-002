// Kept apart from the model so the "Report this event" button (a Client Component) can use these
// without pulling Mongoose into the browser bundle.

export const REPORT_REASONS = ["unsafe", "misleading", "scam", "inappropriate", "other"] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  unsafe: "Looks unsafe or could put people at risk",
  misleading: "Details are false or misleading",
  scam: "Looks like a scam",
  inappropriate: "Not a developer or corporate event",
  other: "Something else",
}
