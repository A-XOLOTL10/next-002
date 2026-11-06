import "server-only"
import QRCode from "qrcode"
import { Types } from "mongoose"
import connectDB from "@/lib/mongodb"
import User from "@/database/user.model"
import Event from "@/database/event.model"
import Booking from "@/database/booking.model"
import OneTimeToken from "@/database/one-time-token.model"
import ScannerDevice, { type DeviceKind, type IScannerDevice } from "@/database/scanner-device.model"
import { isAdminRole } from "@/database/user.constants"
import { TICKET_ID_PATTERN, type TicketTier } from "@/database/ticket.constants"
import { decryptString, randomToken, sha256, verifyTotp } from "@/lib/crypto"
import { LIMITS, consumeAttempt } from "@/lib/rate-limit"
import { logAction, type Actor } from "@/lib/audit"
import { sendDeviceLinkedAlert, sendQuietly } from "@/lib/email"
import { describePlace, getRequestInfo } from "@/lib/request-info"

// The server side of the DevEvent Scanner app (mobile/). How a phone gets access:
//
//   admin phone:  website Mobile app page ─ authenticator code ─> QR "DEVEVENT-LINK:..." (5 min, one use)
//                 └─ app scans it ─> POST /api/scanner/setup ─> admin device token (30 days)
//
//   staff phone:  admin (website or admin phone) picks event + staff name ─> QR "DEVEVENT-STAFF:..." (10 min, one use)
//                 └─ staff app scans it ─> POST /api/scanner/setup ─> staff device token (one event, hours)
//
// After that the app sends "Authorization: Bearer <token>" with every request. A staff phone has
// no account behind it, so there is nothing on it that could change a password or a setting: it
// can only look up and admit tickets for its one event. A phone that is linked to an admin can't
// take a staff pass (the admin's own phone is never the one handed to door staff), and every
// phone stops working as soon as it's unlinked here, expires, or its admin loses access.

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const LINK_CODE_MS = 5 * MINUTE
const STAFF_PASS_MS = 10 * MINUTE
const ADMIN_DEVICE_MS = 30 * 24 * HOUR
const MAX_STAFF_DEVICE_MS = 72 * HOUR
const TOUCH_THROTTLE_MS = MINUTE

const LINK_PREFIX = "DEVEVENT-LINK:"
const STAFF_PREFIX = "DEVEVENT-STAFF:"

/** Staff pass lengths an admin can choose; 0 means "until the event ends". */
export const STAFF_PASS_HOURS = [0, 4, 8, 12] as const

const isObjectId = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{24}$/i.test(value)

/** "j***@gmail.com": enough for door staff to match a person, without handing them the address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  return `${local.slice(0, 1)}***@${domain ?? ""}`
}

/** A ticket ID from whatever was scanned or typed: a /t/DEV-... link, an old ?ticket= link, or the ID itself. */
export function ticketIdFrom(input: string): string | null {
  const raw = (input.match(/ticket=([\w%-]+)/)?.[1] ?? input.match(/\/t\/([\w%-]+)/)?.[1] ?? input).trim()
  let id: string
  try {
    id = decodeURIComponent(raw).toUpperCase()
  } catch {
    return null
  }
  return TICKET_ID_PATTERN.test(id) ? id : null
}

// ---------------------------------------------------------------- setup codes

export type SetupCode = { payload: string; qr: string; expiresAt: string }

const qrFor = (payload: string): Promise<string> => QRCode.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 280 })

/**
 * Step 1 for an admin's phone, from the website: a one-time QR code to scan in the app. Needs a
 * fresh authenticator code even though the admin is signed in, so an unattended laptop can't be
 * used to link someone else's phone.
 */
export async function createDeviceLinkCode(admin: Actor, totpCode: string): Promise<{ ok: true; code: SetupCode } | { ok: false; message: string }> {
  await connectDB()
  if (!(await consumeAttempt(`device-link:${admin.id}`, LIMITS.deviceLinkCode, { failClosed: true }))) {
    return { ok: false, message: "Too many wrong codes. Try again in 15 minutes." }
  }
  const user = await User.findById(admin.id).select("+totpSecretEncrypted +totpLastUsedStep").lean()
  if (!user?.totpSecretEncrypted || !user.totpEnabledAt || !isAdminRole(user.role)) return { ok: false, message: "Set up your authenticator app first." }
  const step = verifyTotp(decryptString(user.totpSecretEncrypted), totpCode.trim(), user.totpLastUsedStep)
  if (step === null) return { ok: false, message: "That authenticator code isn't right." }
  await User.updateOne({ _id: user._id }, { $set: { totpLastUsedStep: step } })

  const token = randomToken()
  const expiresAt = new Date(Date.now() + LINK_CODE_MS)
  // One live code per admin: making a new one cancels the last.
  await OneTimeToken.deleteMany({ userId: user._id, purpose: "device_link" })
  await OneTimeToken.create({ purpose: "device_link", tokenHash: sha256(token), userId: user._id, expiresAt })
  await logAction({ actor: admin, category: "security", action: "device.link_code", summary: `${admin.name} made a code to link a phone to their account` })

  const payload = `${LINK_PREFIX}${token}`
  return { ok: true, code: { payload, qr: await qrFor(payload), expiresAt: expiresAt.toISOString() } }
}

type StaffPassMeta = { eventId: string; label: string; deviceExpiresAt: string; issuerName: string }

/** A one-time QR code that turns a staff member's phone into a scanner for one event. */
export async function createStaffPass(
  issuer: Actor,
  { eventId, label, hours }: { eventId: string; label: string; hours: number },
): Promise<{ ok: true; code: SetupCode; deviceExpiresAt: string; eventTitle: string } | { ok: false; message: string }> {
  if (issuer.role !== "super_admin" && issuer.role !== "supra_admin") return { ok: false, message: "Only admins can hand out staff passes." }
  const name = label.trim().replace(/\s+/g, " ")
  if (name.length < 2 || name.length > 60) return { ok: false, message: "Enter who will use the phone (2 to 60 characters), e.g. \"Gate A, Tunde\"." }
  if (!(STAFF_PASS_HOURS as readonly number[]).includes(hours)) return { ok: false, message: "Choose how long the pass lasts." }
  if (!isObjectId(eventId)) return { ok: false, message: "Choose an event." }

  await connectDB()
  const event = await Event.findById(eventId).select("title status endsAt hideAt").lean()
  if (!event || event.status !== "published") return { ok: false, message: "That event isn't live." }
  const now = Date.now()
  if (event.hideAt && event.hideAt.getTime() <= now) return { ok: false, message: "That event is over." }
  if (!(await consumeAttempt(`staff-pass:${issuer.id}`, LIMITS.staffPass, { failClosed: true }))) {
    return { ok: false, message: "You've made a lot of staff passes this hour. Try again later." }
  }

  // "Until the event ends" = two hours after it finishes, for late arrivals and packing up.
  const untilEnd = (event.endsAt?.getTime() ?? now + 12 * HOUR) + 2 * HOUR
  const deviceExpiresAt = new Date(Math.max(now + HOUR, Math.min(hours === 0 ? untilEnd : now + hours * HOUR, now + MAX_STAFF_DEVICE_MS)))

  const token = randomToken()
  const expiresAt = new Date(now + STAFF_PASS_MS)
  await OneTimeToken.create({
    purpose: "staff_pass",
    tokenHash: sha256(token),
    userId: issuer.id,
    meta: { eventId, label: name, deviceExpiresAt: deviceExpiresAt.toISOString(), issuerName: issuer.name } satisfies StaffPassMeta,
    expiresAt,
  })
  await logAction({
    actor: issuer,
    category: "security",
    action: "device.staff_pass",
    summary: `${issuer.name} made a staff pass for ${name} to check in "${event.title}"`,
    target: { type: "event", id: eventId, label: event.title },
  })

  const payload = `${STAFF_PREFIX}${token}`
  return { ok: true, code: { payload, qr: await qrFor(payload), expiresAt: expiresAt.toISOString() }, deviceExpiresAt: deviceExpiresAt.toISOString(), eventTitle: event.title }
}

// ---------------------------------------------------------------- the app scans a setup code

export type DeviceSummary = {
  kind: DeviceKind
  /** Admin: the admin's name. Staff: who the pass is for. */
  name: string
  role?: string
  eventId?: string
  eventTitle?: string
  issuedBy?: string
  expiresAt: string
}

export type SetupResult = { ok: true; token: string; device: DeviceSummary } | { ok: false; status: number; message: string }

/** Step 2: the app scanned a link code or staff pass. Returns the phone's token (shown only this once). */
export async function redeemSetupCode(
  scanned: string,
  phone: { installId: string; deviceName: string; platform: string },
  ip: string,
): Promise<SetupResult> {
  const text = scanned.trim()
  const kind: DeviceKind | null = text.startsWith(LINK_PREFIX) ? "admin" : text.startsWith(STAFF_PREFIX) ? "staff" : null
  if (!kind) return { ok: false, status: 400, message: "That isn't a DevEvent setup code. Scan the code from the website's Mobile app page, or a staff pass." }
  const raw = text.slice((kind === "admin" ? LINK_PREFIX : STAFF_PREFIX).length)
  if (raw.length < 20 || raw.length > 100) return { ok: false, status: 400, message: "That code is damaged. Ask for a new one." }
  if (typeof phone.installId !== "string" || phone.installId.length < 16 || phone.installId.length > 100) {
    return { ok: false, status: 400, message: "Update the app and try again." }
  }
  const deviceName = (phone.deviceName || "Phone").trim().slice(0, 80)
  const platform = (phone.platform || "").slice(0, 20)

  await connectDB()
  if (!(await consumeAttempt(`scanner-setup:${ip}`, LIMITS.scannerSetup, { failClosed: true }))) {
    return { ok: false, status: 429, message: "Too many tries. Wait 15 minutes and try again." }
  }

  const installHash = sha256(phone.installId)
  // Checked before the pass is used up, so a refused phone doesn't waste it.
  if (kind === "staff" && (await ScannerDevice.exists({ installHash, kind: "admin", expiresAt: { $gt: new Date() } }))) {
    return {
      ok: false,
      status: 409,
      message: "This phone is linked to an admin account, so it can't be used as a staff scanner. Use another phone, or unlink the admin account in the app first.",
    }
  }

  const purpose = kind === "admin" ? "device_link" : "staff_pass"
  const record = await OneTimeToken.findOneAndDelete({ purpose, tokenHash: sha256(raw), expiresAt: { $gt: new Date() } }).lean()
  const expired: SetupResult = { ok: false, status: 410, message: "This code has expired or was already used. Ask for a new one." }
  if (!record) return expired

  const issuer = await User.findById(record.userId).select("email name role status totpEnabledAt").lean()
  if (!issuer || issuer.status !== "active" || !isAdminRole(issuer.role) || !issuer.totpEnabledAt) return expired

  const token = randomToken()
  const now = new Date()
  const request = await getRequestInfo().catch(() => null)
  const base = { tokenHash: sha256(token), installHash, deviceName, platform, lastSeenAt: now, lastIp: ip }
  const issuerActor: Actor = { id: issuer._id.toString(), email: issuer.email, name: issuer.name, role: issuer.role }

  if (kind === "admin") {
    // This app install held something else before (an older link, or a staff pass): replaced.
    await ScannerDevice.deleteMany({ installHash })
    const expiresAt = new Date(now.getTime() + ADMIN_DEVICE_MS)
    const device = await ScannerDevice.create({ ...base, kind, userId: issuer._id, expiresAt })
    await logAction({
      actor: issuerActor,
      category: "security",
      action: "device.linked",
      severity: "warning",
      summary: `${issuer.name} linked a phone (${deviceName}) to the scanner app`,
      target: { type: "device", id: device._id.toString(), label: deviceName },
    })
    const supers = await User.find({ role: "super_admin", status: "active" }).select("email").lean()
    await sendQuietly("phone linked alert", () =>
      sendDeviceLinkedAlert([...new Set([issuer.email, ...supers.map((s) => s.email)])], {
        name: issuer.name,
        email: issuer.email,
        device: `${deviceName}${platform ? ` (${platform})` : ""}`,
        place: request ? describePlace(request) : "Unknown",
        at: now,
      }),
    )
    return { ok: true, token, device: { kind, name: issuer.name, role: issuer.role, expiresAt: expiresAt.toISOString() } }
  }

  const meta = record.meta as StaffPassMeta | undefined
  if (!meta || !isObjectId(meta.eventId)) return expired
  const event = await Event.findById(meta.eventId).select("title status hideAt").lean()
  if (!event || event.status !== "published" || (event.hideAt && event.hideAt <= now)) {
    return { ok: false, status: 410, message: "The event on this pass isn't running any more." }
  }
  await ScannerDevice.deleteMany({ installHash, kind: "staff" })
  const expiresAt = new Date(meta.deviceExpiresAt)
  const device = await ScannerDevice.create({
    ...base,
    kind,
    label: meta.label,
    eventId: event._id,
    issuedBy: issuer._id,
    issuedByName: issuer.name,
    expiresAt,
  })
  await logAction({
    actor: issuerActor,
    category: "security",
    action: "device.staff_joined",
    summary: `${meta.label} set up a staff phone (${deviceName}) for "${event.title}" with ${issuer.name}'s pass`,
    target: { type: "device", id: device._id.toString(), label: meta.label },
  })
  return {
    ok: true,
    token,
    device: { kind, name: meta.label, eventId: event._id.toString(), eventTitle: event.title, issuedBy: issuer.name, expiresAt: expiresAt.toISOString() },
  }
}

// ---------------------------------------------------------------- every app request

export type ScannerContext = {
  device: IScannerDevice
  kind: DeviceKind
  /** Who the activity log names. A staff phone is logged as its staff member, under the admin who issued it. */
  actor: Actor
  summary: DeviceSummary
}

/** The phone behind an "Authorization: Bearer ..." header, or null (unknown, expired, or its admin lost access). */
export async function authenticateDevice(authorization: string | null, ip: string): Promise<ScannerContext | null> {
  const token = authorization?.match(/^Bearer ([\w-]{20,100})$/)?.[1]
  if (!token) return null

  await connectDB()
  const device = await ScannerDevice.findOne({ tokenHash: sha256(token) }).lean()
  if (!device || device.expiresAt.getTime() <= Date.now()) return null

  // The account behind the phone is checked on every request: suspending or removing an admin
  // (or demoting them) cuts off their phone and every staff phone they issued, immediately.
  const owner = await User.findById(device.kind === "admin" ? device.userId : device.issuedBy).select("email name role status totpEnabledAt").lean()
  const ownerOk = owner && owner.status === "active" && isAdminRole(owner.role) && owner.totpEnabledAt
  let eventTitle: string | undefined
  if (device.kind === "staff") {
    const event = device.eventId ? await Event.findById(device.eventId).select("title status").lean() : null
    if (!event || event.status !== "published") return null
    eventTitle = event.title
  }
  if (!ownerOk) {
    await ScannerDevice.deleteOne({ _id: device._id })
    return null
  }

  if (Date.now() - device.lastSeenAt.getTime() > TOUCH_THROTTLE_MS) {
    ScannerDevice.updateOne({ _id: device._id }, { $set: { lastSeenAt: new Date(), lastIp: ip } }).catch((e: unknown) => console.error("Device touch failed:", e))
  }

  const ownerActor = { id: owner._id.toString(), email: owner.email, role: owner.role }
  return device.kind === "admin"
    ? {
        device,
        kind: "admin",
        actor: { ...ownerActor, name: owner.name },
        summary: { kind: "admin", name: owner.name, role: owner.role, expiresAt: device.expiresAt.toISOString() },
      }
    : {
        device,
        kind: "staff",
        actor: { ...ownerActor, name: `${device.label} (staff phone from ${owner.name})` },
        summary: {
          kind: "staff",
          name: device.label ?? "Staff",
          eventId: device.eventId?.toString(),
          eventTitle,
          issuedBy: owner.name,
          expiresAt: device.expiresAt.toISOString(),
        },
      }
}

/** The phone signs itself out ("Unlink this phone" / "Reset" in the app). */
export async function unlinkSelf(ctx: ScannerContext): Promise<void> {
  await ScannerDevice.deleteOne({ _id: ctx.device._id })
  await logAction({
    actor: ctx.actor,
    category: "security",
    action: "device.unlinked",
    summary: `${ctx.actor.name} unlinked their phone (${ctx.device.deviceName}) from the scanner app`,
    target: { type: "device", id: ctx.device._id.toString(), label: ctx.device.deviceName },
  })
}

// ---------------------------------------------------------------- events and tickets

export type ScannerEvent = {
  id: string
  title: string
  date: string
  time: string
  timezone: string
  venue: string
  location: string
  /** What to hand each kind of guest at the door, if the host set it. */
  tags: { regular?: string; vip?: string }
  stats: { tickets: number; checkedIn: number; vip: number; vipCheckedIn: number }
}

/** Live events that can still be checked in (the next ones first). */
export async function liveEventsForScanning(limit = 40): Promise<{ id: string; title: string; date: string; location: string }[]> {
  await connectDB()
  const events = await Event.find({ status: "published", $or: [{ hideAt: { $gt: new Date() } }, { hideAt: { $exists: false } }] })
    .sort({ startsAt: 1 })
    .limit(limit)
    .select("title date location")
    .lean()
  return events.map((e) => ({ id: e._id.toString(), title: e.title, date: e.date, location: e.location }))
}

/** Events this phone may scan, with live counts: every live event for an admin, its one event for staff. */
export async function scannerEvents(ctx: ScannerContext): Promise<ScannerEvent[]> {
  const ids = ctx.kind === "staff" ? [ctx.device.eventId] : (await liveEventsForScanning()).map((e) => new Types.ObjectId(e.id))
  const events = await Event.find({ _id: { $in: ids }, status: "published" })
    .sort({ startsAt: 1 })
    .select("+doorTags title date time timezone venue location")
    .lean()
  const counts = await Booking.aggregate<{ _id: Types.ObjectId; tickets: number; checkedIn: number; vip: number; vipCheckedIn: number }>([
    { $match: { eventId: { $in: events.map((e) => e._id) }, status: "confirmed" } },
    {
      $group: {
        _id: "$eventId",
        tickets: { $sum: 1 },
        checkedIn: { $sum: { $cond: [{ $ifNull: ["$checkedInAt", false] }, 1, 0] } },
        vip: { $sum: { $cond: [{ $eq: ["$tier", "vip"] }, 1, 0] } },
        vipCheckedIn: { $sum: { $cond: [{ $and: [{ $eq: ["$tier", "vip"] }, { $ifNull: ["$checkedInAt", false] }] }, 1, 0] } },
      },
    },
  ])
  return events.map((e) => {
    const c = counts.find((x) => x._id.equals(e._id))
    return {
      id: e._id.toString(),
      title: e.title,
      date: e.date,
      time: e.time,
      timezone: e.timezone,
      venue: e.venue,
      location: e.location,
      tags: { regular: e.doorTags?.regular || undefined, vip: e.doorTags?.vip || undefined },
      stats: { tickets: c?.tickets ?? 0, checkedIn: c?.checkedIn ?? 0, vip: c?.vip ?? 0, vipCheckedIn: c?.vipCheckedIn ?? 0 },
    }
  })
}

export type ScanState = "valid" | "admitted" | "used" | "unconfirmed" | "wrong_event" | "not_found" | "over"

export type ScanResult = {
  state: ScanState
  message: string
  ticketId?: string
  tier?: TicketTier
  /** What to hand this guest ("Gold wristband"), from the event's door tags. */
  tag?: string
  /** Full address for admins, masked for staff phones. */
  email?: string
  checkedInAt?: string
  checkedInBy?: string
}

/** Shared by look-up and admit: everything that decides whether a ticket may come in. */
async function inspect(ctx: ScannerContext, eventId: string, input: string) {
  if (!isObjectId(eventId) || (ctx.kind === "staff" && ctx.device.eventId?.toString() !== eventId)) {
    return { result: { state: "wrong_event", message: "This phone can't check in that event." } satisfies ScanResult }
  }
  if (!(await consumeAttempt(`scanner-scan:${ctx.device._id}`, LIMITS.scannerScan, { failClosed: true }))) {
    return { result: { state: "not_found", message: "Too many scans from this phone in the last hour. Wait a little, then try again." } satisfies ScanResult }
  }
  const ticketId = ticketIdFrom(input)
  if (!ticketId) return { result: { state: "not_found", message: "That isn't a DevEvent ticket." } satisfies ScanResult }

  const booking = await Booking.findOne({ ticketId }).lean()
  if (!booking) return { result: { state: "not_found", ticketId, message: "No ticket with this ID. It may have been cancelled." } satisfies ScanResult }

  const event = await Event.findById(eventId).select("+doorTags title status hideAt").lean()
  if (!event) return { result: { state: "wrong_event", message: "This event no longer exists." } satisfies ScanResult }

  const tier: TicketTier = booking.tier === "vip" ? "vip" : "regular"
  const shown: ScanResult = {
    state: "valid",
    message: "",
    ticketId,
    tier,
    tag: event.doorTags?.[tier] || undefined,
    email: ctx.kind === "admin" ? booking.email : maskEmail(booking.email),
    checkedInAt: booking.checkedInAt?.toISOString(),
    checkedInBy: booking.checkedInBy?.name,
  }

  if (!booking.eventId.equals(event._id)) {
    // Staff only learn that it's another event; admins are told which, to send the guest the right way.
    const other = ctx.kind === "admin" ? await Event.findById(booking.eventId).select("title").lean() : null
    return { result: { state: "wrong_event", ticketId, message: other ? `This ticket is for "${other.title}", not this event.` : "This ticket is for a different event." } satisfies ScanResult }
  }
  if (booking.status !== "confirmed") return { result: { ...shown, state: "unconfirmed", message: "This booking was never confirmed, so the ticket isn't valid." } satisfies ScanResult }
  if (event.hideAt && event.hideAt.getTime() <= Date.now()) return { result: { ...shown, state: "over", message: "This event is over." } satisfies ScanResult }
  if (booking.checkedInAt) return { result: { ...shown, state: "used", message: "Already used. This ticket has been scanned in before." } satisfies ScanResult }
  return { result: { ...shown, message: tier === "vip" ? "Valid VIP ticket." : "Valid ticket." }, booking, event }
}

/** What a scan shows. Never admits: that takes a second, deliberate press in the app. */
export async function lookupTicket(ctx: ScannerContext, eventId: string, input: string): Promise<ScanResult> {
  return (await inspect(ctx, eventId, input)).result
}

/** Admits a ticket. One atomic update, so two phones scanning the same ticket can't both let it in. */
export async function admitTicket(ctx: ScannerContext, eventId: string, input: string): Promise<ScanResult> {
  const checked = await inspect(ctx, eventId, input)
  if (!checked.booking) return checked.result
  const { booking, event, result } = checked

  const admitted = await Booking.findOneAndUpdate(
    { _id: booking._id, eventId: event._id, status: "confirmed", checkedInAt: { $exists: false } },
    { $set: { checkedInAt: new Date(), checkedInBy: { kind: ctx.kind === "admin" ? "admin_device" : "staff_device", name: ctx.actor.name, deviceId: ctx.device._id } } },
    { returnDocument: "after" },
  ).lean()

  await logAction({
    actor: ctx.actor,
    category: "bookings",
    action: admitted ? "checkin.admit" : "checkin.reused",
    severity: admitted ? "info" : "warning",
    summary: admitted
      ? `${ctx.actor.name} admitted ${booking.ticketId}${result.tier === "vip" ? " (VIP)" : ""} to "${event.title}" with the scanner app`
      : `${ctx.actor.name} scanned ${booking.ticketId} again (already used)`,
    target: { type: "ticket", label: booking.ticketId },
    details: { device: ctx.device.deviceName, deviceKind: ctx.kind },
  })

  if (!admitted) {
    const now = await Booking.findById(booking._id).select("checkedInAt checkedInBy").lean()
    return { ...result, state: "used", message: "Already used. Another phone let this ticket in a moment ago.", checkedInAt: now?.checkedInAt?.toISOString(), checkedInBy: now?.checkedInBy?.name }
  }
  return { ...result, state: "admitted", message: result.tier === "vip" ? "Admitted. Welcome, VIP!" : "Admitted. Welcome!", checkedInAt: admitted.checkedInAt?.toISOString() }
}

// ---------------------------------------------------------------- managing phones

export type DeviceRow = {
  id: string
  kind: DeviceKind
  deviceName: string
  platform?: string
  /** Admin phones: whose. Staff phones: the staff member. */
  name: string
  eventId?: string
  eventTitle?: string
  issuedBy?: string
  lastSeenAt: string
  expiresAt: string
  createdAt: string
  /** The viewer may unlink it. */
  canRevoke: boolean
}

/**
 * Phones a team member can see: the super admin sees every phone; a supra admin sees their own
 * phones and every staff phone (any admin may need to cut off a lost staff phone at the door).
 */
export async function listDevices(viewer: Actor, { eventId, kind }: { eventId?: string; kind?: DeviceKind } = {}): Promise<DeviceRow[]> {
  await connectDB()
  const isSuper = viewer.role === "super_admin"
  const filter: Record<string, unknown> = { expiresAt: { $gt: new Date() } }
  if (!isSuper) filter.$or = [{ kind: "staff" }, { kind: "admin", userId: viewer.id }]
  if (eventId && isObjectId(eventId)) filter.eventId = eventId
  if (kind) filter.kind = kind
  const devices = await ScannerDevice.find(filter).sort({ kind: 1, createdAt: -1 }).limit(300).lean()

  const users = await User.find({ _id: { $in: devices.flatMap((d) => (d.userId ? [d.userId] : [])) } }).select("name").lean()
  const events = await Event.find({ _id: { $in: devices.flatMap((d) => (d.eventId ? [d.eventId] : [])) } }).select("title").lean()
  return devices.map((d) => ({
    id: d._id.toString(),
    kind: d.kind,
    deviceName: d.deviceName,
    platform: d.platform || undefined,
    name: d.kind === "admin" ? (users.find((u) => u._id.equals(d.userId))?.name ?? "Admin") : (d.label ?? "Staff"),
    eventId: d.eventId?.toString(),
    eventTitle: events.find((e) => d.eventId && e._id.equals(d.eventId))?.title,
    issuedBy: d.issuedByName,
    lastSeenAt: d.lastSeenAt.toISOString(),
    expiresAt: d.expiresAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    canRevoke: d.kind === "staff" || isSuper || d.userId?.toString() === viewer.id,
  }))
}

/** Unlinks one phone. Staff phones: any admin. Admin phones: their owner or the super admin. */
export async function revokeDevice(viewer: Actor, deviceId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isObjectId(deviceId)) return { ok: false, message: "Unknown phone." }
  await connectDB()
  const device = await ScannerDevice.findById(deviceId).lean()
  if (!device) return { ok: false, message: "That phone is already unlinked." }
  if (device.kind === "admin" && viewer.role !== "super_admin" && device.userId?.toString() !== viewer.id) {
    return { ok: false, message: "Only the super admin can unlink another admin's phone." }
  }
  await ScannerDevice.deleteOne({ _id: device._id })
  await logAction({
    actor: viewer,
    category: "security",
    action: "device.revoked",
    severity: "warning",
    summary: `${viewer.name} unlinked ${device.kind === "staff" ? `${device.label}'s staff phone` : "an admin phone"} (${device.deviceName})`,
    target: { type: "device", id: deviceId, label: device.label ?? device.deviceName },
  })
  return { ok: true }
}

/** "Sign out every staff phone" (for one event, or all of them). */
export async function revokeStaffDevices(viewer: Actor, eventId?: string): Promise<number> {
  await connectDB()
  const { deletedCount } = await ScannerDevice.deleteMany(eventId && isObjectId(eventId) ? { kind: "staff" as const, eventId } : { kind: "staff" as const })
  await logAction({ actor: viewer, category: "security", action: "device.revoked_all", severity: "warning", summary: `${viewer.name} signed out ${deletedCount} staff phone(s)` })
  return deletedCount
}
