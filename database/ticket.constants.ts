// Kept apart from the models so Client Components can import these without pulling in Mongoose.

/**
 * A ticket is "regular" unless its email is on the event's VIP list. The QR code and ticket ID
 * look the same for both: the tier is looked up on the server when the ticket is scanned, so
 * nobody can turn a regular ticket into a VIP one by editing a QR code.
 */
export const TICKET_TIERS = ["regular", "vip"] as const
export type TicketTier = (typeof TICKET_TIERS)[number]

export const TICKET_TIER_LABELS: Record<TicketTier, string> = { regular: "Regular", vip: "VIP" }

/** "booking": the visitor booked on the site. "vip_invite": the host put them on the VIP list. */
export const BOOKING_SOURCES = ["booking", "vip_invite"] as const
export type BookingSource = (typeof BOOKING_SOURCES)[number]

/** Limits for VIP lists, so a host can't use them to mass-email strangers. */
export const VIP_RULES = { maxPerEvent: 300, maxPerSubmit: 100, tagMaxLength: 60 } as const

/** "DEV-7KQ2M9XA4P": the ticket ID ("dev token") printed under every QR code. */
export const TICKET_ID_PATTERN = /^DEV-[A-Z0-9]{10}$/
