import "server-only"
import { Types } from "mongoose"
import connectDB from "@/lib/mongodb"
import Event, { type IEvent } from "@/database/event.model"
import Booking from "@/database/booking.model"
import HostProfile from "@/database/host-profile.model"
import User from "@/database/user.model"
import EventRevision, { Report, REPORT_REASONS, type ReportReason } from "@/database/event-revision.model"
import { AUDIENCE_AGES, HOST_EDITABLE_STATUSES, IMAGE_RULES, type AudienceAge } from "@/database/event.constants"
import {
  deleteCloudinaryImage,
  expireTags,
  findMissingFields,
  imageUploadsConfigured,
  parseEventForm,
  toServiceError,
  uploadImageFiles,
} from "@/lib/events.service"
import { DocumentError, storePrivateFile } from "@/lib/documents"
import { verifyAiImageGrant } from "@/lib/ai-images"
import { actorOf, verifyPublishPin, type CurrentSession } from "@/lib/auth"
import { logAction, snapshotHash } from "@/lib/audit"
import { notifyAdmins } from "@/lib/host.service"
import { sendAttendeeUpdate, sendEventReviewEmail, sendQuietly } from "@/lib/email"
import { EVENTS_TAG, bookingsTag, eventTag } from "@/lib/cache-tags"
import { LIMITS, clientIp, consumeAttempt } from "@/lib/rate-limit"
import { hasEnded, toList } from "@/lib/utils"

// Events created by hosts, and their review by admins.
//
//   host: draft ──submit──> in_review ──admin approves (PIN)──> published
//                              │──changes_requested──> host edits ──submit──> in_review
//                              └──rejected
//   published ──host edits──> EventRevision (pending) ──admin approves──> changes copied onto the event
//   published ──host or admin cancels──> cancelled (everyone booked is emailed)

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; errors?: Record<string, string> }

const PHONE = /^\+?[\d\s()-]{7,20}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Fields that, when changed on a live event, are emailed to everyone who booked. */
const MATERIAL_FIELDS: { key: keyof IEvent; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "time", label: "Start time" },
  { key: "endDate", label: "End date" },
  { key: "endTime", label: "End time" },
  { key: "timezone", label: "Timezone" },
  { key: "venue", label: "Venue" },
  { key: "location", label: "Location" },
  { key: "mode", label: "Format" },
]

// ---------------------------------------------------------------- host: reading

export type HostEventSummary = {
  slug: string
  title: string
  status: IEvent["status"]
  date?: string
  location?: string
  image?: string
  confirmed: number
  checkedIn: number
  pendingRevision: boolean
  reviewReason?: string
  endsAt?: string
}

/** The host's own events with confirmed bookings (people who verified their email) and check-ins. */
export async function getHostEvents(userId: string): Promise<HostEventSummary[]> {
  await connectDB()
  const events = await Event.find({ ownerId: userId }).sort({ createdAt: -1 }).select("slug title status date location images review endsAt").lean()
  const ids = events.map((e) => e._id)
  const [counts, revisions] = await Promise.all([
    Booking.aggregate<{ _id: Types.ObjectId; confirmed: number; checkedIn: number }>([
      { $match: { eventId: { $in: ids }, status: "confirmed" } },
      { $group: { _id: "$eventId", confirmed: { $sum: 1 }, checkedIn: { $sum: { $cond: [{ $ifNull: ["$checkedInAt", false] }, 1, 0] } } } },
    ]),
    EventRevision.find({ eventId: { $in: ids }, status: "pending" }).select("eventId").lean(),
  ])
  return events.map((e) => {
    const count = counts.find((c) => c._id.equals(e._id))
    return {
      slug: e.slug,
      title: e.title,
      status: e.status,
      date: e.date,
      location: e.location,
      image: e.images[0],
      confirmed: count?.confirmed ?? 0,
      checkedIn: count?.checkedIn ?? 0,
      pendingRevision: revisions.some((r) => r.eventId.equals(e._id)),
      reviewReason: e.review?.reason,
      endsAt: e.endsAt?.toISOString(),
    }
  })
}

export type HostEventFormValues = {
  slug: string
  status: IEvent["status"]
  title: string
  description?: string
  overview?: string
  images: string[]
  imageDisplay: IEvent["imageDisplay"]
  venue?: string
  location?: string
  date?: string
  time?: string
  endDate?: string
  endTime?: string
  timezone: string
  mode?: IEvent["mode"]
  category?: IEvent["category"]
  audience?: string
  organizer?: string
  agenda: string[]
  tags: string[]
  hostContact?: { name: string; phone: string; email: string }
  sponsorIds: string[]
  audienceAge?: AudienceAge
  safeguardingContact?: { name: string; phone: string }
  hasAuthorizationLetter: boolean
  reviewReason?: string
  pendingRevision: boolean
}

/** One of the host's events for the edit form; null if it isn't theirs. */
export async function getHostEventForEdit(userId: string, slug: string): Promise<HostEventFormValues | null> {
  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase(), ownerId: userId }).lean()
  if (!event) return null
  const pending = await EventRevision.findOne({ eventId: event._id, status: "pending" }).lean()
  // A live event with a waiting revision shows the proposed values, so the host edits what they sent.
  const proposed = (pending?.changes ?? {}) as Partial<IEvent>
  const value = <K extends keyof IEvent>(key: K): IEvent[K] => (key in proposed ? (proposed[key] as IEvent[K]) : event[key])
  return {
    slug: event.slug,
    status: event.status,
    title: value("title"),
    description: value("description"),
    overview: value("overview"),
    images: pending?.images ?? event.images,
    imageDisplay: value("imageDisplay"),
    venue: value("venue"),
    location: value("location"),
    date: value("date"),
    time: value("time"),
    endDate: value("endDate"),
    endTime: value("endTime"),
    timezone: value("timezone"),
    mode: value("mode"),
    category: value("category"),
    audience: value("audience"),
    organizer: value("organizer"),
    agenda: toList(value("agenda")),
    tags: toList(value("tags")),
    hostContact: event.hostContact,
    sponsorIds: event.sponsors.map((s) => s.orgId.toString()),
    audienceAge: event.audienceAge,
    safeguardingContact: event.safeguardingContact,
    hasAuthorizationLetter: Boolean(event.authorizationLetterId),
    reviewReason: event.review?.reason,
    pendingRevision: Boolean(pending),
  }
}

// ---------------------------------------------------------------- host: saving

type HostExtras = {
  hostContact?: { name: string; phone: string; email: string }
  sponsors?: { orgId: Types.ObjectId; name: string; confirmed: boolean }[]
  audienceAge?: AudienceAge
  safeguardingContact?: { name: string; phone: string }
}

/** Reads the host-only fields: contact, sponsors (from the verification file), age range, safeguarding. */
async function parseHostExtras(formData: FormData, userId: string, errors: Record<string, string>): Promise<HostExtras> {
  const get = (key: string) => {
    const value = formData.get(key)
    return typeof value === "string" ? value.trim() : ""
  }
  const extras: HostExtras = {}

  const contact = { name: get("contactName"), phone: get("contactPhone"), email: get("contactEmail").toLowerCase() }
  if (contact.phone && !PHONE.test(contact.phone)) errors.contactPhone = "Enter a valid phone number"
  if (contact.email && !EMAIL.test(contact.email)) errors.contactEmail = "Enter a valid email"
  if (contact.name || contact.phone || contact.email) extras.hostContact = contact

  const age = AUDIENCE_AGES.find((a) => a === get("audienceAge"))
  if (age) extras.audienceAge = age
  const guard = { name: get("safeguardingName"), phone: get("safeguardingPhone") }
  if (guard.phone && !PHONE.test(guard.phone)) errors.safeguardingPhone = "Enter a valid phone number"
  if (guard.name || guard.phone) extras.safeguardingContact = guard

  // Sponsors must come from the host's own verification file: those are the organizations we call.
  const profile = await HostProfile.findOne({ userId }).select("organizations").lean()
  const chosen = formData.getAll("sponsorIds").filter((v): v is string => typeof v === "string")
  const orgs = (profile?.organizations ?? []).filter((o) => chosen.includes(o._id.toString()))
  if (chosen.length !== orgs.length) errors.sponsorIds = "Choose sponsors from your verified organizations"
  extras.sponsors = orgs.map((o) => ({ orgId: o._id, name: o.name, confirmed: o.status === "confirmed" }))
  return extras
}

/** What must be true before a host event can be sent for review (on top of the normal publishing fields). */
function hostSubmitProblems(event: Partial<IEvent>, hasLetter: boolean): Record<string, string> {
  const errors: Record<string, string> = { ...findMissingFields(event) }
  if (!event.hostContact?.name || !event.hostContact.phone || !event.hostContact.email) errors.contactName = "Add the event contact's name, phone and email"
  if (!event.category) errors.category = "Choose the kind of event"
  if (!event.audienceAge) errors.audienceAge = "Say who the event is for"
  if (event.audienceAge && event.audienceAge !== "adults") {
    if (!event.safeguardingContact?.name || !event.safeguardingContact.phone) errors.safeguardingName = "Events open to under-18s need a named safeguarding contact"
    if (event.mode === "online") errors.audienceAge = "Online events for under-18s aren't accepted yet"
  }
  if (!event.sponsors?.length) errors.sponsorIds = "Choose at least one company or sponsor behind this event"
  if (!hasLetter) errors.authorizationLetter = "Upload the authorization letter signed by the company's CEO"
  return errors
}

/** AI images arrive as signed URLs: only images generated for this host in this session are accepted. */
function acceptedAiImages(formData: FormData, userId: string): string[] {
  return formData
    .getAll("aiImages")
    .filter((v): v is string => typeof v === "string")
    .map((v) => verifyAiImageGrant(v, userId))
    .filter((url): url is string => Boolean(url))
}

/**
 * Creates (slug null) or saves one of the host's events. intent "submit" sends it for review.
 * For a live event, changes become a revision for an admin to approve; visitors keep seeing the
 * approved version meanwhile.
 */
export async function saveHostEvent(session: CurrentSession, slug: string | null, formData: FormData): Promise<Result<{ slug: string; revision?: boolean }>> {
  const userId = session.user.id
  const intent = formData.get("intent") === "submit" ? "submit" : "save"

  await connectDB()
  const profile = await HostProfile.findOne({ userId }).select("status").lean()
  if (profile?.status !== "approved") return { ok: false, message: "Your host account needs to be verified before you can create events." }
  if (!(await consumeAttempt(`host-event:${userId}`, LIMITS.hostEvent))) return { ok: false, message: "Too many saves in a short time. Please wait a little and try again." }

  const parsed = parseEventForm(formData)
  if ("ok" in parsed) return { ok: false, message: parsed.message, errors: parsed.errors }
  const errors: Record<string, string> = {}
  const extras = await parseHostExtras(formData, userId, errors)
  const aiImages = acceptedAiImages(formData, userId)
  const letterInput = formData.get("authorizationLetter")
  const letterFile = letterInput instanceof File && letterInput.size > 0 ? letterInput : null
  if (parsed.newImages.length > 0 && !imageUploadsConfigured()) errors.images = "Image uploads aren't configured on the server"
  if (Object.keys(errors).length > 0) return { ok: false, message: "Please check the highlighted fields.", errors }

  const existing = slug ? await Event.findOne({ slug: slug.toLowerCase(), ownerId: userId }) : null
  if (slug && !existing) return { ok: false, message: "Event not found." }
  if (existing && !HOST_EDITABLE_STATUSES.includes(existing.status) && existing.status !== "published") {
    return { ok: false, message: existing.status === "in_review" ? "This event is being reviewed. You can edit it once our team has finished." : "This event can no longer be edited." }
  }
  if (existing?.status === "published" && hasEnded(existing.endsAt)) return { ok: false, message: "This event has ended, so it can't be changed." }

  const currentImages = existing?.images ?? []
  const keptImages = currentImages.filter((url) => !parsed.removeImages.includes(url))
  const imageCount = keptImages.length + aiImages.length + parsed.newImages.length
  if (imageCount > IMAGE_RULES.maxImages) return { ok: false, message: "Please check the highlighted fields.", errors: { images: `An event can have at most ${IMAGE_RULES.maxImages} images` } }

  // ---- a live event: record a revision instead of changing what visitors see
  if (existing?.status === "published") return proposeRevision(session, existing, parsed.fields, extras, keptImages, aiImages, parsed.newImages)

  let uploaded: string[] = []
  let letterId = existing?.authorizationLetterId
  try {
    if (letterFile) letterId = await storePrivateFile(letterFile, userId, "authorization_letter")
    uploaded = await uploadImageFiles(parsed.newImages)

    const event = existing ?? new Event({ status: "draft", source: "manual", ownerId: new Types.ObjectId(userId) })
    event.set({ ...parsed.fields, ...extras, authorizationLetterId: letterId, images: [...keptImages, ...aiImages, ...uploaded] })
    if (!event.title) return { ok: false, message: "Give the event a title.", errors: { title: "Required" } }

    if (intent === "submit") {
      const problems = hostSubmitProblems(event.toObject(), Boolean(letterId))
      if (Object.keys(problems).length > 0) {
        await Promise.all(uploaded.map(deleteCloudinaryImage))
        return { ok: false, message: "Some details are missing before this can be reviewed.", errors: problems }
      }
      event.status = "in_review"
      event.review = { submittedAt: new Date() }
    }
    await event.save()

    // Images removed from a draft are deleted from Cloudinary (a live event's are kept until a revision is approved).
    await Promise.all(currentImages.filter((url) => !keptImages.includes(url)).map(deleteCloudinaryImage))

    await logAction({
      actor: actorOf(session),
      category: "events",
      action: intent === "submit" ? "host_event.submit" : existing ? "host_event.update" : "host_event.create",
      summary: `${session.user.name} ${intent === "submit" ? "sent for review" : existing ? "saved" : "created"} "${event.title}"`,
      target: { type: "event", id: event._id.toString(), label: event.slug },
    })
    if (intent === "submit") {
      await sendQuietly("event submitted", () => sendEventReviewEmail(session.user.email, { name: session.user.name, title: event.title, slug: event.slug, kind: "submitted" }))
      await notifyAdmins(`Event to review: ${event.title}`, [`${session.user.name} sent "${event.title}" for review.`, `Sponsors to confirm: ${event.sponsors.map((s) => s.name).join(", ")}.`])
    }
    return { ok: true, data: { slug: event.slug } }
  } catch (e) {
    await Promise.all(uploaded.map(deleteCloudinaryImage))
    if (e instanceof DocumentError) return { ok: false, message: e.message, errors: { authorizationLetter: e.message } }
    const error = toServiceError(e, "save")
    return { ok: false, message: error.message, errors: error.errors }
  }
}

async function proposeRevision(
  session: CurrentSession,
  event: InstanceType<typeof Event>,
  fields: Record<string, unknown>,
  extras: HostExtras,
  keptImages: string[],
  aiImages: string[],
  newImages: File[],
): Promise<Result<{ slug: string; revision: boolean }>> {
  // Only what actually differs is stored, so the admin sees exactly what would change.
  const changes: Record<string, unknown> = {}
  const current = event.toObject() as unknown as Record<string, unknown>
  for (const [key, value] of Object.entries({ ...fields, ...(extras.hostContact ? { hostContact: extras.hostContact } : {}) })) {
    if (key === "title") continue // the title (and so the web address) stays fixed once live
    const before = Array.isArray(current[key]) ? toList(current[key] as string[]) : current[key]
    if (JSON.stringify(before ?? "") !== JSON.stringify(value ?? "")) changes[key] = value
  }

  let uploaded: string[] = []
  try {
    uploaded = await uploadImageFiles(newImages)
  } catch (e) {
    const error = toServiceError(e, "save")
    return { ok: false, message: error.message, errors: error.errors }
  }
  const images = [...keptImages, ...aiImages, ...uploaded]
  const imagesChanged = JSON.stringify(images) !== JSON.stringify(event.images)
  if (Object.keys(changes).length === 0 && !imagesChanged) return { ok: false, message: "Nothing changed." }
  if (images.length === 0) return { ok: false, message: "A live event needs at least one image.", errors: { images: "Keep or add at least one image" } }

  // A newer proposal replaces a waiting one (its new uploads are removed if not reused).
  const older = await EventRevision.findOneAndUpdate({ eventId: event._id, status: "pending" }, { $set: { status: "superseded" } }).lean()
  if (older?.images) await Promise.all(older.images.filter((url) => !images.includes(url) && !event.images.includes(url)).map(deleteCloudinaryImage))

  await EventRevision.create({ eventId: event._id, proposedBy: session.user.id, changes, images: imagesChanged ? images : undefined, status: "pending" })
  await logAction({ actor: actorOf(session), category: "events", action: "host_event.revision", summary: `${session.user.name} proposed changes to live event "${event.title}"`, target: { type: "event", id: event._id.toString(), label: event.slug }, details: { fields: Object.keys(changes), images: imagesChanged } })
  await notifyAdmins(`Changes to review: ${event.title}`, [`${session.user.name} proposed changes to the live event "${event.title}": ${[...Object.keys(changes), ...(imagesChanged ? ["images"] : [])].join(", ")}.`])
  return { ok: true, data: { slug: event.slug, revision: true } }
}

/** The host withdraws a draft that hasn't been reviewed yet (deletes it). */
export async function deleteHostDraft(session: CurrentSession, slug: string): Promise<Result> {
  await connectDB()
  const event = await Event.findOneAndDelete({ slug: slug.toLowerCase(), ownerId: session.user.id, status: { $in: ["draft", "changes_requested", "rejected"] } }).lean()
  if (!event) return { ok: false, message: "Only drafts can be deleted. Live events can be cancelled instead." }
  await Promise.all(event.images.map(deleteCloudinaryImage))
  await logAction({ actor: actorOf(session), category: "events", action: "host_event.delete", summary: `${session.user.name} deleted the draft "${event.title}"`, target: { type: "event", label: event.slug } })
  return { ok: true }
}

/** Cancels a live event (host for their own, or an admin), closing bookings and emailing everyone booked. */
export async function cancelEvent(session: CurrentSession, slug: string, reason: string, { asAdmin = false } = {}): Promise<Result> {
  const cleanReason = reason.trim().slice(0, 2000)
  if (cleanReason.length < 5) return { ok: false, message: "Give a short reason. It's included in the email to everyone who booked." }
  await connectDB()
  const filter = { slug: slug.toLowerCase(), status: "published" as const, ...(asAdmin ? {} : { ownerId: new Types.ObjectId(session.user.id) }) }
  const event = await Event.findOneAndUpdate(filter, { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: cleanReason } }, { returnDocument: "after" }).lean()
  if (!event) return { ok: false, message: "This event isn't live, so it can't be cancelled." }

  const bookings = await Booking.find({ eventId: event._id, status: "confirmed" }).select("email").lean()
  if (bookings.length > 0) await sendQuietly("event cancelled", () => sendAttendeeUpdate(bookings.map((b) => b.email), { event, kind: "cancelled", reason: cleanReason }))
  await EventRevision.updateMany({ eventId: event._id, status: "pending" }, { $set: { status: "superseded" } })
  expireTags(EVENTS_TAG, eventTag(event.slug), bookingsTag(event._id.toString()))
  await logAction({ actor: actorOf(session), category: "events", action: "event.cancel", severity: "critical", summary: `${session.user.name} cancelled "${event.title}" (${bookings.length} people emailed)`, target: { type: "event", id: event._id.toString(), label: event.slug }, details: { reason: cleanReason } })
  return { ok: true }
}

// ---------------------------------------------------------------- admin: event review

export async function getEventsAwaitingReview() {
  await connectDB()
  const events = await Event.find({ status: "in_review" }).sort({ "review.submittedAt": 1 }).select("slug title ownerId review sponsors date location").lean()
  const owners = await User.find({ _id: { $in: events.flatMap((e) => (e.ownerId ? [e.ownerId] : [])) } }).select("name email").lean()
  return events.map((e) => ({
    slug: e.slug,
    title: e.title,
    host: owners.find((o) => e.ownerId && o._id.equals(e.ownerId))?.name ?? "Unknown host",
    submittedAt: e.review?.submittedAt?.toISOString(),
    date: e.date,
    location: e.location,
    sponsors: e.sponsors.map((s) => s.name),
  }))
}

/** A host event with everything the reviewer needs: sponsors' check results, the letter, the host. */
export async function getHostEventForReview(slug: string) {
  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase(), ownerId: { $exists: true } }).lean()
  if (!event?.ownerId) return null
  const [owner, profile, revision] = await Promise.all([
    User.findById(event.ownerId).select("name email").lean(),
    HostProfile.findOne({ userId: event.ownerId }).select("organizations companyName status").lean(),
    EventRevision.findOne({ eventId: event._id, status: "pending" }).lean(),
  ])
  const sponsors = event.sponsors.map((s) => {
    const org = profile?.organizations.find((o) => o._id.equals(s.orgId))
    return { name: s.name, status: org?.status ?? "missing", contactName: org?.contactName, contactPhone: org?.contactPhone, contactEmail: org?.contactEmail }
  })
  return {
    event: { ...event, _id: event._id.toString(), agenda: toList(event.agenda), tags: toList(event.tags), endsAt: event.endsAt?.toISOString(), ownerId: event.ownerId.toString(), authorizationLetterId: event.authorizationLetterId?.toString(), sponsors: undefined },
    owner: owner && { name: owner.name, email: owner.email },
    profile: profile && { _id: profile._id.toString(), companyName: profile.companyName, status: profile.status },
    sponsors,
    revision: revision && { _id: revision._id.toString(), changes: revision.changes, images: revision.images, createdAt: revision.createdAt.toISOString() },
    missing: Object.keys(hostSubmitProblems(event, Boolean(event.authorizationLetterId))),
  }
}

export type EventDecision = "approve" | "changes_requested" | "rejected"

/**
 * Approve (publish), send back for changes, or reject a host's event. Approving needs the
 * publish PIN, every sponsor confirmed, and the host still verified; the exact approved content
 * is fingerprinted into the activity log.
 */
export async function decideHostEvent(admin: CurrentSession, slug: string, decision: EventDecision, reason: string, pin: string): Promise<Result> {
  const cleanReason = reason.trim().slice(0, 2000)
  if (decision !== "approve" && cleanReason.length < 5) return { ok: false, message: "Write a short note for the host." }

  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase(), ownerId: { $exists: true } })
  if (!event?.ownerId) return { ok: false, message: "Event not found." }
  if (event.ownerId.toString() === admin.user.id) return { ok: false, message: "You can't review your own event." }
  if (event.status !== "in_review") return { ok: false, message: `This event was already handled${event.review?.reviewedByName ? ` by ${event.review.reviewedByName}` : ""}. Reload to see it.` }

  if (decision === "approve") {
    const check = await verifyPublishPin(pin)
    if (check !== "ok") return { ok: false, message: check === "wrong" ? "That PIN is incorrect." : check === "locked" ? "Too many wrong PINs. Try again in 15 minutes." : "Publishing isn't set up (ADMIN_PUBLISH_PIN)." }
    const profile = await HostProfile.findOne({ userId: event.ownerId }).select("organizations status").lean()
    if (profile?.status !== "approved") return { ok: false, message: "The host isn't verified (or was suspended), so their events can't go live." }
    const unconfirmed = event.sponsors.filter((s) => profile.organizations.find((o) => o._id.equals(s.orgId))?.status !== "confirmed")
    if (unconfirmed.length > 0) return { ok: false, message: `Confirm these organizations on the host's page first: ${unconfirmed.map((s) => s.name).join(", ")}.` }
    const problems = hostSubmitProblems(event.toObject(), Boolean(event.authorizationLetterId))
    if (Object.keys(problems).length > 0) return { ok: false, message: `Missing: ${Object.keys(problems).join(", ")}. Ask the host for changes instead.` }
    if (hasEnded(event.endsAt)) return { ok: false, message: "This event has already ended." }
  }

  const hash = snapshotHash({ ...event.toObject(), updatedAt: undefined, review: undefined, status: undefined })
  const next = decision === "approve" ? "published" : decision
  const updated = await Event.findOneAndUpdate(
    { _id: event._id, status: "in_review" },
    {
      $set: {
        status: next,
        review: { ...event.review, reviewedAt: new Date(), reviewedBy: new Types.ObjectId(admin.user.id), reviewedByName: admin.user.name, reason: cleanReason || undefined },
        ...(decision === "approve" ? { publishedAt: new Date(), approvedSnapshotHash: hash, sponsors: event.sponsors.map((s) => ({ ...s, confirmed: true })) } : {}),
      },
    },
    { returnDocument: "after" },
  ).lean()
  if (!updated) return { ok: false, message: "Another admin handled this event at the same moment. Reload to see their decision." }

  if (decision === "approve") expireTags(EVENTS_TAG, eventTag(event.slug))
  await logAction({
    actor: actorOf(admin),
    category: "events",
    action: `host_event.${decision}`,
    severity: decision === "approve" ? "warning" : "info",
    summary: `${admin.user.name} ${decision === "approve" ? "approved and published" : decision === "changes_requested" ? "asked for changes to" : "rejected"} "${event.title}"`,
    target: { type: "event", id: event._id.toString(), label: event.slug },
    details: { reason: cleanReason || undefined },
    snapshotHash: decision === "approve" ? hash : undefined,
  })
  const owner = await User.findById(event.ownerId).select("name email").lean()
  if (owner) await sendQuietly("event review", () => sendEventReviewEmail(owner.email, { name: owner.name, title: event.title, slug: event.slug, kind: decision === "approve" ? "approved" : decision, reason: cleanReason || undefined }))
  return { ok: true }
}

export async function getPendingRevisions() {
  await connectDB()
  const revisions = await EventRevision.find({ status: "pending" }).sort({ createdAt: 1 }).lean()
  const events = await Event.find({ _id: { $in: revisions.map((r) => r.eventId) } }).select("slug title").lean()
  return revisions.map((r) => {
    const event = events.find((e) => e._id.equals(r.eventId))
    return { _id: r._id.toString(), slug: event?.slug, title: event?.title ?? "Deleted event", fields: [...Object.keys(r.changes), ...(r.images ? ["images"] : [])], createdAt: r.createdAt.toISOString() }
  })
}

/** Approve (apply to the live event, then email attendees about material changes) or reject a revision. */
export async function decideRevision(admin: CurrentSession, revisionId: string, approve: boolean, reason: string, pin: string): Promise<Result> {
  if (!/^[a-f\d]{24}$/i.test(revisionId)) return { ok: false, message: "Invalid request." }
  const cleanReason = reason.trim().slice(0, 2000)
  if (!approve && cleanReason.length < 5) return { ok: false, message: "Write a short note for the host." }

  await connectDB()
  const revision = await EventRevision.findById(revisionId).lean()
  if (!revision || revision.status !== "pending") return { ok: false, message: `This change was already handled${revision?.reviewedByName ? ` by ${revision.reviewedByName}` : ""}.` }
  const event = await Event.findById(revision.eventId)
  if (!event || event.status !== "published") return { ok: false, message: "The event isn't live any more." }
  if (event.ownerId?.toString() === admin.user.id) return { ok: false, message: "You can't review your own event." }

  if (approve) {
    const check = await verifyPublishPin(pin)
    if (check !== "ok") return { ok: false, message: check === "wrong" ? "That PIN is incorrect." : check === "locked" ? "Too many wrong PINs. Try again in 15 minutes." : "Publishing isn't set up (ADMIN_PUBLISH_PIN)." }
  }

  // Claim the revision first (atomic), so two admins can't both apply it.
  const claimed = await EventRevision.findOneAndUpdate(
    { _id: revision._id, status: "pending" },
    { $set: { status: approve ? "approved" : "rejected", reviewedBy: admin.user.id, reviewedByName: admin.user.name, reviewedAt: new Date(), reason: cleanReason || undefined } },
    { returnDocument: "after" },
  ).lean()
  if (!claimed) return { ok: false, message: "Another admin handled this change at the same moment." }

  const owner = await User.findById(event.ownerId).select("name email").lean()
  if (!approve) {
    if (revision.images) await Promise.all(revision.images.filter((url) => !event.images.includes(url)).map(deleteCloudinaryImage))
    await logAction({ actor: actorOf(admin), category: "events", action: "host_event.revision_reject", summary: `${admin.user.name} rejected changes to "${event.title}"`, target: { type: "event", id: event._id.toString(), label: event.slug }, details: { reason: cleanReason } })
    if (owner) await sendQuietly("revision rejected", () => sendEventReviewEmail(owner.email, { name: owner.name, title: event.title, slug: event.slug, kind: "revision_rejected", reason: cleanReason }))
    return { ok: true }
  }

  const before = event.toObject()
  const removedImages = revision.images ? event.images.filter((url) => !revision.images!.includes(url)) : []
  try {
    event.set({ ...revision.changes, ...(revision.images ? { images: revision.images } : {}) })
    await event.save() // pre-save hooks re-normalize dates and recompute start/end times
  } catch (e) {
    // The change no longer fits (e.g. its date passed): put the revision back for the host to fix.
    await EventRevision.updateOne({ _id: revision._id }, { $set: { status: "rejected", reason: "The proposed changes couldn't be applied. Please submit them again." } })
    const error = toServiceError(e, "update")
    return { ok: false, message: `Couldn't apply the changes: ${error.message} ${Object.values(error.errors ?? {}).join(" ")}`.trim() }
  }
  await Promise.all(removedImages.map(deleteCloudinaryImage))
  expireTags(EVENTS_TAG, eventTag(event.slug))

  const changedMaterial = MATERIAL_FIELDS.filter(({ key }) => String(before[key] ?? "") !== String(event.get(key) ?? ""))
  let notified = 0
  if (changedMaterial.length > 0) {
    const bookings = await Booking.find({ eventId: event._id, status: "confirmed" }).select("email").lean()
    notified = bookings.length
    if (notified > 0) {
      await sendQuietly("event changed", () =>
        sendAttendeeUpdate(bookings.map((b) => b.email), { event: event.toObject(), kind: "changed", changes: changedMaterial.map(({ key, label }) => [label, String(event.get(key) ?? "")]) }),
      )
    }
  }
  await logAction({
    actor: actorOf(admin),
    category: "events",
    action: "host_event.revision_approve",
    severity: "warning",
    summary: `${admin.user.name} approved changes to "${event.title}"${notified ? ` and emailed ${notified} attendees` : ""}`,
    target: { type: "event", id: event._id.toString(), label: event.slug },
    details: { fields: Object.keys(revision.changes), images: Boolean(revision.images) },
    snapshotHash: snapshotHash({ ...event.toObject(), updatedAt: undefined }),
  })
  if (owner) await sendQuietly("revision approved", () => sendEventReviewEmail(owner.email, { name: owner.name, title: event.title, slug: event.slug, kind: "revision_approved" }))
  return { ok: true }
}

// ---------------------------------------------------------------- reports

/** "Report this event" from any visitor. Rate-limited per address. */
export async function createReport(slug: string, input: { reason: string; details?: string; contactEmail?: string }): Promise<Result> {
  const reason = REPORT_REASONS.find((r) => r === input.reason) as ReportReason | undefined
  if (!reason) return { ok: false, message: "Choose a reason." }
  const contactEmail = input.contactEmail?.trim().toLowerCase()
  if (contactEmail && !EMAIL.test(contactEmail)) return { ok: false, message: "Enter a valid email, or leave it empty." }
  if (!(await consumeAttempt(`report:${await clientIp()}`, LIMITS.report))) return { ok: false, message: "You've sent several reports recently. Please try again later." }

  await connectDB()
  const event = await Event.findOne({ slug: slug.toLowerCase(), status: "published" }).select("_id title").lean()
  if (!event) return { ok: false, message: "This event isn't listed any more." }
  await Report.create({ eventId: event._id, reason, details: input.details?.trim().slice(0, 2000) || undefined, contactEmail: contactEmail || undefined })
  await logAction({ category: "events", action: "event.report", severity: reason === "unsafe" || reason === "scam" ? "critical" : "warning", summary: `A visitor reported "${event.title}" (${reason})`, target: { type: "event", id: event._id.toString(), label: slug } })
  await notifyAdmins(`Event reported: ${event.title}`, [`A visitor reported "${event.title}": ${reason}.`, ...(input.details ? [`Details: ${input.details.slice(0, 500)}`] : [])])
  return { ok: true }
}

export async function getOpenReports() {
  await connectDB()
  const reports = await Report.find({ status: "open" }).sort({ createdAt: 1 }).limit(100).lean()
  const events = await Event.find({ _id: { $in: reports.map((r) => r.eventId) } }).select("slug title status").lean()
  return reports.map((r) => {
    const event = events.find((e) => e._id.equals(r.eventId))
    return { _id: r._id.toString(), reason: r.reason, details: r.details, contactEmail: r.contactEmail, createdAt: r.createdAt.toISOString(), event: event && { slug: event.slug, title: event.title, status: event.status } }
  })
}

/** Dismiss a report, or act on it by cancelling the event (attendees are emailed). */
export async function resolveReport(admin: CurrentSession, reportId: string, action: "dismiss" | "cancel_event", note: string): Promise<Result> {
  if (!/^[a-f\d]{24}$/i.test(reportId)) return { ok: false, message: "Invalid request." }
  if (note.trim().length < 3) return { ok: false, message: "Add a short note about what you decided." }
  await connectDB()
  const report = await Report.findOneAndUpdate({ _id: reportId, status: "open" }, { $set: { status: "resolved", resolvedBy: admin.user.id, resolvedByName: admin.user.name, resolution: `${action}: ${note.trim()}`.slice(0, 2000) } }, { returnDocument: "after" }).lean()
  if (!report) return { ok: false, message: "This report was already handled." }
  if (action === "cancel_event") {
    const event = await Event.findById(report.eventId).select("slug").lean()
    if (event) {
      const result = await cancelEvent(admin, event.slug, `Removed after a report: ${note.trim()}`, { asAdmin: true })
      if (!result.ok) return result
    }
  }
  await logAction({ actor: actorOf(admin), category: "events", action: `report.${action}`, severity: action === "cancel_event" ? "critical" : "info", summary: `${admin.user.name} ${action === "dismiss" ? "dismissed" : "acted on"} a report (${report.reason})`, target: { type: "report", id: reportId }, details: { note: note.trim() } })
  return { ok: true }
}
