import "server-only"
import { Types } from "mongoose"
import { z } from "zod"
import connectDB from "@/lib/mongodb"
import HostProfile, { type IHostProfile, type IOrganization } from "@/database/host-profile.model"
import User from "@/database/user.model"
import Event from "@/database/event.model"
import Booking from "@/database/booking.model"
import {
  ACCOUNT_TYPES,
  DOCUMENT_RULES,
  HOST_REVIEW_STATUSES,
  ID_TYPES,
  MAX_CONTACT_ATTEMPTS,
  ORG_ROLES,
  type HostStatus,
} from "@/database/user.constants"
import { DocumentError, findDuplicateUploads, storePrivateFile } from "@/lib/documents"
import { verificationTimingMessage } from "@/lib/business-hours"
import { logAction, snapshotHash } from "@/lib/audit"
import { actorOf, type CurrentSession } from "@/lib/auth"
import { sendAdminQueueNotice, sendAttendeeUpdate, sendHostStatusEmail, sendQuietly } from "@/lib/email"
import { EVENTS_TAG, eventTag } from "@/lib/cache-tags"
import { expireTags } from "@/lib/events.service"

// Host verification (KYC): what the host submits, what admins check, and every decision.
// Status flow and meanings: database/user.constants.ts (HOST_STATUSES).

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; message: string; errors?: Record<string, string> }

const PHONE = /^\+?[\d\s()-]{7,20}$/
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const OrganizationInput = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  name: z.string().trim().min(2, "Enter the organization's name").max(160),
  role: z.enum(ORG_ROLES),
  contactName: z.string().trim().min(2, "Enter a contact person").max(120),
  contactPhone: z.string().trim().regex(PHONE, "Enter a valid phone number"),
  contactEmail: z.string().trim().toLowerCase().regex(EMAIL, "Enter a valid email"),
  website: z.string().trim().max(300).refine((v) => !v || URL_RE.test(v), "Use a full link starting with https://").optional(),
})
type OrganizationInput = z.infer<typeof OrganizationInput>

// ---------------------------------------------------------------- reading

export type HostProfileView = Omit<IHostProfile, "_id" | "userId" | "organizations" | "idDocument" | "companyDocumentIds" | "appeal" | "contactLog" | "reviewedBy"> & {
  _id: string
  organizations: (Omit<IOrganization, "_id" | "checkedBy"> & { _id: string })[]
  idDocument?: { type: string; number: string; expiresAt?: string; fileId: string }
  companyDocumentIds: string[]
  appeal?: { message: string; fileIds: string[]; submittedAt: Date }
  contactLog: { at: Date; byName: string; orgName?: string; outcome: string; notes?: string }[]
}

const toView = (p: IHostProfile): HostProfileView => ({
  ...p,
  _id: p._id.toString(),
  organizations: p.organizations.map((o) => ({ ...o, _id: o._id.toString(), checkedBy: undefined })),
  idDocument: p.idDocument && { ...p.idDocument, fileId: p.idDocument.fileId.toString() },
  companyDocumentIds: p.companyDocumentIds.map(String),
  appeal: p.appeal && { ...p.appeal, fileIds: p.appeal.fileIds.map(String) },
  contactLog: p.contactLog.map(({ at, byName, orgName, outcome, notes }) => ({ at, byName, orgName, outcome, notes })),
  reviewedBy: undefined,
} as HostProfileView)

export async function getHostProfile(userId: string): Promise<HostProfileView | null> {
  await connectDB()
  const profile = await HostProfile.findOne({ userId }).lean()
  return profile ? toView(profile) : null
}

/** The host's verification status, or "draft" if they haven't started. */
export async function getHostStatus(userId: string): Promise<HostStatus> {
  await connectDB()
  const profile = await HostProfile.findOne({ userId }).select("status").lean()
  return profile?.status ?? "draft"
}

// ---------------------------------------------------------------- host: submit details

/**
 * Saves the verification form. intent "save" keeps a draft (fields may be missing);
 * "submit" checks everything, then sends it for review and notifies the admin team.
 * Only possible while the profile is a draft or the admin asked for more information.
 */
export async function saveVerification(session: CurrentSession, formData: FormData): Promise<Result> {
  const userId = session.user.id
  const intent = formData.get("intent") === "submit" ? "submit" : "save"
  const get = (key: string) => {
    const value = formData.get(key)
    return typeof value === "string" ? value.trim() : ""
  }
  const errors: Record<string, string> = {}

  await connectDB()
  const existing = await HostProfile.findOne({ userId })
  if (existing && !["draft", "needs_info"].includes(existing.status)) {
    return { ok: false, message: "Your details are already with our team, so they can't be changed right now." }
  }

  const accountType = ACCOUNT_TYPES.find((t) => t === get("accountType"))
  if (!accountType) errors.accountType = "Choose company or individual"

  // Organizations arrive as one JSON list from the form's repeater.
  let organizations: OrganizationInput[] = []
  try {
    const parsed = z.array(OrganizationInput).max(10, "List at most 10 organizations").safeParse(JSON.parse(get("organizations") || "[]"))
    if (parsed.success) organizations = parsed.data
    else errors.organizations = parsed.error.issues[0]?.message ?? "Check the organizations"
  } catch {
    errors.organizations = "Check the organizations"
  }

  const socials = get("socials").split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 8)
  if (socials.some((s) => !URL_RE.test(s))) errors.socials = "Use full links (https://...), one per line"
  const website = get("website")
  if (website && !URL_RE.test(website)) errors.website = "Use a full link starting with https://"
  const contactPhone = get("contactPhone")
  if (contactPhone && !PHONE.test(contactPhone)) errors.contactPhone = "Enter a valid phone number, e.g. +234 800 000 0000"
  const contactEmail = get("contactEmail").toLowerCase()
  if (contactEmail && !EMAIL.test(contactEmail)) errors.contactEmail = "Enter a valid email"
  const idType = ID_TYPES.find((t) => t === get("idType"))
  const idExpiresAt = get("idExpiresAt")
  if (idExpiresAt && (!/^\d{4}-\d{2}-\d{2}$/.test(idExpiresAt) || new Date(`${idExpiresAt}T23:59:59Z`).getTime() < Date.now())) {
    errors.idExpiresAt = "This ID has expired. Please use a valid one."
  }

  const idFile = formData.get("idFile")
  const newIdFile = idFile instanceof File && idFile.size > 0 ? idFile : null
  const companyFiles = formData.getAll("companyDocs").filter((v): v is File => v instanceof File && v.size > 0)
  const keptCompanyDocs = (existing?.companyDocumentIds ?? []).filter((id) => !formData.getAll("removeCompanyDocs").includes(id.toString()))
  if (keptCompanyDocs.length + companyFiles.length > DOCUMENT_RULES.maxCompanyDocuments) errors.companyDocs = `Upload at most ${DOCUMENT_RULES.maxCompanyDocuments} company documents`

  // Everything required to send for review.
  if (intent === "submit") {
    const need = (key: string, message: string) => {
      if (!get(key)) errors[key] ??= message
    }
    if (accountType === "company") {
      need("companyName", "Enter your company's registered name")
      need("companyRegNumber", "Enter the company registration number (e.g. CAC RC number)")
      need("companyAddress", "Enter the company's address")
    }
    need("companyDescription", "Tell us briefly what your company or community does")
    need("contactName", "Enter the main contact's name")
    need("contactPhone", "Enter a phone number we can call")
    need("contactEmail", "Enter a contact email")
    if (!idType) errors.idType = "Choose the type of ID"
    need("idNumber", "Enter the ID number")
    if (!newIdFile && !existing?.idDocument) errors.idFile = "Upload a photo or scan of the ID"
    if (accountType === "company" && keptCompanyDocs.length + companyFiles.length === 0) errors.companyDocs = "Upload your company registration certificate"
    if (organizations.length === 0) {
      errors.organizations = "List at least one company or sponsor behind your events"
    } else if (accountType === "company" && !organizations.some((o) => o.role === "owner")) {
      errors.organizations = "Include your own company (role: owner) so we can confirm it"
    }
    if (formData.get("consent") !== "on") errors.consent = "Please confirm the details and agree to us contacting these organizations"
  }

  if (Object.keys(errors).length > 0) return { ok: false, message: "Please check the highlighted fields.", errors }

  // Organizations: keep the check result for any that didn't change; changed ones are checked again.
  const previous = new Map((existing?.organizations ?? []).map((o) => [o._id.toString(), o]))
  const orgDocs = organizations.map((input) => {
    const before = input.id ? previous.get(input.id) : undefined
    const unchanged = before && before.name === input.name && before.contactPhone === input.contactPhone && before.contactEmail === input.contactEmail
    return {
      _id: before?._id ?? new Types.ObjectId(),
      name: input.name,
      role: input.role,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      website: input.website || undefined,
      status: unchanged ? before.status : "pending",
      attempts: unchanged ? before.attempts : 0,
      notes: unchanged ? before.notes : undefined,
      checkedByName: unchanged ? before.checkedByName : undefined,
      checkedAt: unchanged ? before.checkedAt : undefined,
    }
  })

  // Files are stored only after the fields pass, so a failed form doesn't leave orphaned uploads.
  let idFileId = existing?.idDocument?.fileId
  const newCompanyDocIds: Types.ObjectId[] = []
  try {
    if (newIdFile) idFileId = await storePrivateFile(newIdFile, userId, "id_document")
    for (const file of companyFiles) newCompanyDocIds.push(await storePrivateFile(file, userId, "company_document"))
  } catch (e) {
    if (e instanceof DocumentError) return { ok: false, message: e.message, errors: { [newIdFile && !idFileId ? "idFile" : "companyDocs"]: e.message } }
    throw e
  }

  const values = {
    userId,
    accountType: accountType ?? existing?.accountType ?? "company",
    companyName: get("companyName") || undefined,
    companyRegNumber: get("companyRegNumber") || undefined,
    companyAddress: get("companyAddress") || undefined,
    companyDescription: get("companyDescription") || undefined,
    website: website || undefined,
    socials,
    contactName: get("contactName") || session.user.name,
    contactRole: get("contactRole") || undefined,
    contactPhone: contactPhone || "",
    contactEmail: contactEmail || session.user.email,
    organizations: orgDocs,
    idDocument: idType && get("idNumber") && idFileId ? { type: idType, number: get("idNumber"), expiresAt: idExpiresAt || undefined, fileId: idFileId } : existing?.idDocument,
    companyDocumentIds: [...keptCompanyDocs, ...newCompanyDocIds],
    ...(intent === "submit" ? { status: "pending_review" as const, submittedAt: new Date(), consentAt: new Date() } : {}),
  }

  // contactPhone is required by the schema: a draft without one stores an empty string.
  const profile = existing
    ? await HostProfile.findOneAndUpdate({ _id: existing._id, status: { $in: ["draft", "needs_info"] } }, { $set: values }, { returnDocument: "after", runValidators: true })
    : await HostProfile.create({ ...values, status: values.status ?? "draft" })
  if (!profile) return { ok: false, message: "Your details changed status while you were editing. Please reload the page." }

  await logAction({
    actor: actorOf(session),
    category: "hosts",
    action: intent === "submit" ? "host.submit" : "host.save_draft",
    summary: intent === "submit" ? `${session.user.name} sent their verification details for review` : `${session.user.name} saved verification details`,
    target: { type: "host", id: profile._id.toString(), label: values.companyName ?? session.user.name },
  })

  if (intent === "submit") {
    const timing = verificationTimingMessage()
    await sendQuietly("verification received", () => sendHostStatusEmail(session.user.email, { name: session.user.name, kind: "received", timing }))
    await notifyAdmins(`New host to verify: ${values.companyName ?? session.user.name}`, [
      `${session.user.name} (${session.user.email}) sent their details for verification.`,
      `Organizations to contact: ${orgDocs.map((o) => `${o.name} (${o.role})`).join(", ")}.`,
    ])
  }
  return { ok: true }
}

/** After a denial, the host may explain once (with optional documents). Goes back to the queue. */
export async function submitAppeal(session: CurrentSession, formData: FormData): Promise<Result> {
  const message = String(formData.get("message") ?? "").trim()
  if (message.length < 20) return { ok: false, message: "Please explain what happened in a few sentences.", errors: { message: "At least 20 characters" } }
  if (message.length > 4000) return { ok: false, message: "Please keep it under 4,000 characters.", errors: { message: "Too long" } }
  const files = formData.getAll("files").filter((v): v is File => v instanceof File && v.size > 0).slice(0, 3)

  await connectDB()
  const profile = await HostProfile.findOne({ userId: session.user.id, status: "denied" })
  if (!profile) return { ok: false, message: "There's no decision to respond to." }
  if (profile.appeal) return { ok: false, message: "You've already responded to this decision." }

  const fileIds: Types.ObjectId[] = []
  try {
    for (const file of files) fileIds.push(await storePrivateFile(file, session.user.id, "appeal"))
  } catch (e) {
    if (e instanceof DocumentError) return { ok: false, message: e.message, errors: { files: e.message } }
    throw e
  }

  const updated = await HostProfile.findOneAndUpdate(
    { _id: profile._id, status: "denied", appeal: { $exists: false } },
    { $set: { status: "appeal_pending", appeal: { message, fileIds, submittedAt: new Date() }, submittedAt: new Date() } },
    { returnDocument: "after" },
  )
  if (!updated) return { ok: false, message: "You've already responded to this decision." }

  await logAction({ actor: actorOf(session), category: "hosts", action: "host.appeal", severity: "warning", summary: `${session.user.name} responded to their verification denial`, target: { type: "host", id: profile._id.toString(), label: profile.companyName ?? session.user.name } })
  await sendQuietly("appeal received", () => sendHostStatusEmail(session.user.email, { name: session.user.name, kind: "appeal_received", timing: verificationTimingMessage() }))
  await notifyAdmins(`Host response to review: ${profile.companyName ?? session.user.name}`, [`${session.user.name} responded to a denial. Their explanation is on the review page.`])
  return { ok: true }
}

// ---------------------------------------------------------------- admin: review

async function notifyAdmins(subject: string, lines: string[]): Promise<void> {
  const admins = await User.find({ role: { $in: ["super_admin", "supra_admin"] }, status: "active" }).select("email").lean()
  await sendQuietly("admin queue notice", () => sendAdminQueueNotice(admins.map((a) => a.email), { subject, lines, path: "/host/console/approvals" }))
}
export { notifyAdmins }

export type HostReviewItem = {
  _id: string
  name: string
  email: string
  company?: string
  accountType: string
  status: HostStatus
  submittedAt?: string
  organizations: { name: string; status: string }[]
}

export async function getHostsAwaitingReview(): Promise<HostReviewItem[]> {
  await connectDB()
  const profiles = await HostProfile.find({ status: { $in: HOST_REVIEW_STATUSES } }).sort({ submittedAt: 1 }).lean()
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select("name email").lean()
  return profiles.map((p) => {
    const user = users.find((u) => u._id.equals(p.userId))
    return {
      _id: p._id.toString(),
      name: user?.name ?? "Unknown",
      email: user?.email ?? "",
      company: p.companyName,
      accountType: p.accountType,
      status: p.status,
      submittedAt: p.submittedAt?.toISOString(),
      organizations: p.organizations.map((o) => ({ name: o.name, status: o.status })),
    }
  })
}

/** Every verified or past host, newest first (for the Hosts list). */
export async function getAllHosts(): Promise<HostReviewItem[]> {
  await connectDB()
  const profiles = await HostProfile.find({ status: { $ne: "draft" } }).sort({ updatedAt: -1 }).limit(200).lean()
  const users = await User.find({ _id: { $in: profiles.map((p) => p.userId) } }).select("name email").lean()
  return profiles.map((p) => {
    const user = users.find((u) => u._id.equals(p.userId))
    return { _id: p._id.toString(), name: user?.name ?? "Unknown", email: user?.email ?? "", company: p.companyName, accountType: p.accountType, status: p.status, submittedAt: p.submittedAt?.toISOString(), organizations: p.organizations.map((o) => ({ name: o.name, status: o.status })) }
  })
}

/** Everything an admin needs to review one host, plus warning signs. */
export async function getHostForReview(profileId: string) {
  if (!/^[a-f\d]{24}$/i.test(profileId)) return null
  await connectDB()
  const profile = await HostProfile.findById(profileId).lean()
  if (!profile) return null
  const user = await User.findById(profile.userId).select("name email googleWorkspaceDomain providers createdAt status").lean()

  const flags: string[] = []
  if (profile.companyRegNumber) {
    const sameReg = await HostProfile.countDocuments({ companyRegNumber: profile.companyRegNumber, _id: { $ne: profile._id } })
    if (sameReg > 0) flags.push(`${sameReg} other host account(s) use the same registration number`)
  }
  const fileIds = [profile.idDocument?.fileId, ...profile.companyDocumentIds].filter((id): id is Types.ObjectId => Boolean(id))
  const duplicates = await findDuplicateUploads(fileIds, profile.userId)
  if (duplicates > 0) flags.push(`The same document was uploaded by ${duplicates} other account(s)`)
  const emailDomain = user?.email.split("@")[1]
  if (emailDomain && ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(emailDomain) && profile.accountType === "company") {
    flags.push("Company account signed up with a personal email address")
  }
  if (user?.googleWorkspaceDomain) flags.push(`Signed in with a Google Workspace account on ${user.googleWorkspaceDomain} (a good sign)`)

  return { profile: toView(profile), user: user && { _id: user._id.toString(), name: user.name, email: user.email, status: user.status, createdAt: user.createdAt }, flags }
}

/** Records one contact attempt with an organization, and its outcome. */
export async function recordOrgCheck(
  admin: CurrentSession,
  profileId: string,
  orgId: string,
  outcome: "confirmed" | "denied" | "no_answer" | "note",
  notes: string,
): Promise<Result> {
  if (!/^[a-f\d]{24}$/i.test(profileId) || !/^[a-f\d]{24}$/i.test(orgId)) return { ok: false, message: "Invalid request." }
  if ((outcome === "denied" || outcome === "note") && notes.trim().length < 3) return { ok: false, message: "Add a note saying who you spoke to and what they said." }

  await connectDB()
  const profile = await HostProfile.findById(profileId)
  const org = profile?.organizations.find((o) => o._id.toString() === orgId)
  if (!profile || !org) return { ok: false, message: "This organization no longer exists on the request." }
  if (profile.userId.toString() === admin.user.id) return { ok: false, message: "You can't verify your own host account." }

  if (outcome === "confirmed" || outcome === "denied") org.status = outcome
  if (outcome === "no_answer") {
    org.attempts += 1
    if (org.attempts >= MAX_CONTACT_ATTEMPTS && org.status === "pending") org.status = "unreachable"
  }
  if (outcome !== "note") {
    org.checkedBy = new Types.ObjectId(admin.user.id)
    org.checkedByName = admin.user.name
    org.checkedAt = new Date()
  }
  if (notes.trim()) org.notes = notes.trim().slice(0, 2000)
  profile.contactLog.push({ at: new Date(), by: new Types.ObjectId(admin.user.id), byName: admin.user.name, orgId: org._id, orgName: org.name, outcome, notes: notes.trim().slice(0, 2000) || undefined })
  await profile.save()

  await logAction({
    actor: actorOf(admin),
    category: "hosts",
    action: `host.org_${outcome}`,
    severity: outcome === "denied" ? "warning" : "info",
    summary: `${admin.user.name} recorded "${outcome.replace("_", " ")}" for ${org.name} (${profile.companyName ?? "host"})`,
    target: { type: "host", id: profileId, label: profile.companyName },
    details: { org: org.name, notes: notes.trim() || undefined },
  })
  return { ok: true }
}

export type HostDecision = "approve" | "needs_info" | "deny" | "reject" | "suspend" | "reinstate"

const DECISION_FROM: Record<HostDecision, HostStatus[]> = {
  approve: ["pending_review", "appeal_pending"],
  needs_info: ["pending_review", "appeal_pending"],
  deny: ["pending_review", "appeal_pending"],
  reject: ["pending_review", "appeal_pending", "denied", "needs_info"],
  suspend: ["approved"],
  reinstate: ["suspended"],
}

/**
 * An admin's decision on a host. One atomic update that only succeeds from the expected
 * status, so when two admins act at once only the first counts; the second is told who did.
 */
export async function decideHost(admin: CurrentSession, profileId: string, decision: HostDecision, reason: string): Promise<Result> {
  if (!/^[a-f\d]{24}$/i.test(profileId)) return { ok: false, message: "Invalid request." }
  const cleanReason = reason.trim().slice(0, 2000)
  if (decision !== "approve" && decision !== "reinstate" && cleanReason.length < 5) return { ok: false, message: "Write a short reason. The host will see it." }

  await connectDB()
  const profile = await HostProfile.findById(profileId).lean()
  if (!profile) return { ok: false, message: "This request no longer exists." }
  if (profile.userId.toString() === admin.user.id) return { ok: false, message: "You can't decide on your own host account." }
  if (!DECISION_FROM[decision].includes(profile.status)) {
    return { ok: false, message: `This request was already handled${profile.reviewedByName ? ` by ${profile.reviewedByName}` : ""} (now: ${profile.status.replace("_", " ")}). Reload to see it.` }
  }

  if (decision === "approve") {
    const unconfirmed = profile.organizations.filter((o) => o.status !== "confirmed")
    if (unconfirmed.length > 0) return { ok: false, message: `Confirm every organization first: ${unconfirmed.map((o) => o.name).join(", ")}.` }
  }
  const deniedOrg = profile.organizations.find((o) => o.status === "denied")
  if (decision === "deny" && !deniedOrg) return { ok: false, message: "Record which organization denied the partnership first (on its card above)." }

  // A second denial (after the host's one response) is final.
  const finalStatus: HostStatus =
    decision === "approve" || decision === "reinstate" ? "approved"
      : decision === "needs_info" ? "needs_info"
        : decision === "deny" ? (profile.denialCount >= 1 ? "rejected" : "denied")
          : decision === "suspend" ? "suspended" : "rejected"

  const updated = await HostProfile.findOneAndUpdate(
    { _id: profile._id, status: profile.status },
    {
      $set: { status: finalStatus, reviewedAt: new Date(), reviewedBy: admin.user.id, reviewedByName: admin.user.name, decisionReason: cleanReason || undefined },
      ...(decision === "deny" ? { $inc: { denialCount: 1 } } : {}),
      // A request for more information lets the host edit and resend; a new denial allows a new response.
      ...(decision === "needs_info" || decision === "deny" ? { $unset: { appeal: 1 } } : {}),
    },
    { returnDocument: "after" },
  ).lean()
  if (!updated) return { ok: false, message: "Another admin handled this request at the same moment. Reload to see their decision." }

  const user = await User.findById(profile.userId).select("name email").lean()

  // Suspension takes the host's live events down and tells everyone who booked.
  let cancelledEvents = 0
  if (decision === "suspend") cancelledEvents = await cancelHostEvents(profile.userId.toString(), `The host's account was suspended: ${cleanReason}`)

  await logAction({
    actor: actorOf(admin),
    category: "hosts",
    action: `host.${decision}`,
    severity: decision === "approve" || decision === "reinstate" ? "warning" : "critical",
    summary: `${admin.user.name} ${{ approve: "approved", needs_info: "asked for more information from", deny: finalStatus === "rejected" ? "denied (final) " : "denied", reject: "rejected", suspend: "suspended", reinstate: "reinstated" }[decision]} ${profile.companyName ?? user?.name ?? "a host"}${cancelledEvents ? ` and cancelled ${cancelledEvents} live event(s)` : ""}`,
    target: { type: "host", id: profileId, label: profile.companyName ?? user?.email },
    details: { reason: cleanReason || undefined, previousStatus: profile.status },
    snapshotHash: decision === "approve" ? snapshotHash({ ...profile, contactLog: undefined, updatedAt: undefined }) : undefined,
  })

  if (user) {
    const kind = finalStatus === "approved" ? "approved" : finalStatus === "needs_info" ? "needs_info" : finalStatus === "denied" ? "denied" : finalStatus === "suspended" ? "suspended" : "rejected"
    await sendQuietly(`host ${kind}`, () => sendHostStatusEmail(user.email, { name: user.name, kind, reason: cleanReason || undefined, orgName: deniedOrg?.name }))
  }
  return { ok: true }
}

/** Cancels every live event a host owns and emails the people who booked. Returns how many. */
export async function cancelHostEvents(ownerId: string, reason: string): Promise<number> {
  const events = await Event.find({ ownerId, status: "published" }).lean()
  for (const event of events) {
    await Event.updateOne({ _id: event._id }, { $set: { status: "cancelled", cancelledAt: new Date(), cancelReason: reason.slice(0, 2000) } })
    const bookings = await Booking.find({ eventId: event._id, status: "confirmed" }).select("email").lean()
    if (bookings.length > 0) {
      await sendQuietly("event cancelled", () =>
        sendAttendeeUpdate(bookings.map((b) => b.email), { event, kind: "cancelled", reason: "The event's host can no longer run it on DevEvent." }),
      )
    }
    expireTags(eventTag(event.slug))
  }
  if (events.length > 0) expireTags(EVENTS_TAG)
  return events.length
}
