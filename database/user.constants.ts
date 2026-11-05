// Kept apart from the models so Client Components can import these without pulling in Mongoose.

/**
 * Who someone is on DevEvent:
 * - super_admin: one person, total control (adds/removes supra admins, sees the activity log).
 * - supra_admin: reviews hosts and events, publishes, checks tickets in. Can't touch the team.
 * - host: a company or individual who lists events once verified.
 */
export const ROLES = ["super_admin", "supra_admin", "host"] as const
export type Role = (typeof ROLES)[number]

export const ADMIN_ROLES: readonly Role[] = ["super_admin", "supra_admin"]
export const isAdminRole = (role: Role | undefined): boolean => role === "super_admin" || role === "supra_admin"

/** "invited": a supra admin who hasn't set a password yet. "deleted" accounts can't sign in. */
export const USER_STATUSES = ["active", "invited", "suspended", "deleted"] as const
export type UserStatus = (typeof USER_STATUSES)[number]

export const OAUTH_PROVIDERS = ["google", "github"] as const
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

/** Passwords: long beats complex. 12+ characters, and never one known from a data breach. */
export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 200

// ---------------------------------------------------------------- host verification

export const ACCOUNT_TYPES = ["company", "individual"] as const
export type AccountType = (typeof ACCOUNT_TYPES)[number]

/**
 * Host verification (KYC), in order:
 *   draft -> pending_review -> approved
 *                           -> needs_info  (host edits and resubmits -> pending_review)
 *                           -> denied      (an organization denied the partnership; host may appeal once)
 *                                -> appeal_pending -> approved | rejected
 *                           -> rejected    (final)
 *   approved -> suspended (by an admin; all their events are unpublished)
 */
export const HOST_STATUSES = [
  "draft", "pending_review", "needs_info", "denied", "appeal_pending", "approved", "rejected", "suspended",
] as const
export type HostStatus = (typeof HOST_STATUSES)[number]

/** Statuses waiting on an admin, oldest first in the approvals queue. */
export const HOST_REVIEW_STATUSES: readonly HostStatus[] = ["pending_review", "appeal_pending"]

export const ORG_ROLES = ["owner", "sponsor", "partner"] as const
export type OrgRole = (typeof ORG_ROLES)[number]

/** What the admin found when contacting an organization. */
export const ORG_CHECK_STATUSES = ["pending", "confirmed", "denied", "unreachable"] as const
export type OrgCheckStatus = (typeof ORG_CHECK_STATUSES)[number]

/** After this many failed calls an organization counts as unreachable: ask the host for another contact. */
export const MAX_CONTACT_ATTEMPTS = 2

export const ID_TYPES = ["nin", "passport", "drivers_licence", "voters_card", "other"] as const
export type IdType = (typeof ID_TYPES)[number]
export const ID_TYPE_LABELS: Record<IdType, string> = {
  nin: "National ID (NIN slip or card)",
  passport: "International passport",
  drivers_licence: "Driver's licence",
  voters_card: "Voter's card",
  other: "Other government-issued ID",
}

/** Uploaded documents: PDF or photos, kept small because they're stored encrypted in the database. */
export const DOCUMENT_RULES = {
  maxBytes: 4 * 1024 * 1024, // 4 MB each
  maxCompanyDocuments: 4,
  formats: "PDF, PNG or JPEG",
  accept: "application/pdf,image/png,image/jpeg",
} as const

/** Verification promise shown to hosts (West Africa Time). */
export const VERIFICATION_HOURS = { startHour: 9, endHour: 18, timezone: "Africa/Lagos", label: "9am to 6pm WAT, Monday to Friday" } as const
export const VERIFICATION_TARGET_MINUTES = 10
