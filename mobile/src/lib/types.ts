// Shapes returned by the website's /api/scanner routes (lib/scanner.ts on the server).

export type DeviceKind = "admin" | "staff"

export type DeviceSummary = {
  kind: DeviceKind
  /** Admin: the admin's name. Staff: who the pass is for ("Gate A, Tunde"). */
  name: string
  role?: string
  eventId?: string
  eventTitle?: string
  issuedBy?: string
  expiresAt: string
}

export type ScannerEvent = {
  id: string
  title: string
  date: string
  time: string
  timezone: string
  venue: string
  location: string
  tags: { regular?: string; vip?: string }
  stats: { tickets: number; checkedIn: number; vip: number; vipCheckedIn: number }
}

export type TicketTier = "regular" | "vip"

export type ScanState = "valid" | "admitted" | "used" | "unconfirmed" | "wrong_event" | "not_found" | "over"

export type ScanResult = {
  state: ScanState
  message: string
  ticketId?: string
  tier?: TicketTier
  tag?: string
  email?: string
  checkedInAt?: string
  checkedInBy?: string
}

export type StaffPass = { payload: string; qr: string; expiresAt: string; deviceExpiresAt: string; eventTitle: string }

export type StaffDevice = {
  id: string
  deviceName: string
  platform?: string
  name: string
  eventTitle?: string
  issuedBy?: string
  lastSeenAt: string
  expiresAt: string
  canRevoke: boolean
}

/** What this phone keeps in secure storage after setup. */
export type Credential = { token: string; device: DeviceSummary }
