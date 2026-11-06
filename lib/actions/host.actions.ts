"use server"

import { redirect } from "next/navigation"
import { refresh } from "next/cache"
import connectDB from "@/lib/mongodb"
import User from "@/database/user.model"
import Session from "@/database/session.model"
import PrivateFile from "@/database/private-file.model"
import { actorOf, requireHost, requireUser, signOutEverywhere } from "@/lib/auth"
import { saveVerification, submitAppeal, cancelHostEvents } from "@/lib/host.service"
import { cancelEvent, createReport, deleteHostDraft, saveHostEvent } from "@/lib/host-events.service"
import { generateEventImage, type GenerateResult } from "@/lib/ai-images"
import type { DesignStyle } from "@/lib/design-categories"
import type { EventCategory } from "@/database/event.constants"
import { hashPassword, verifyPassword } from "@/lib/crypto"
import { checkNewPassword } from "@/lib/passwords"
import { logAction } from "@/lib/audit"
import { cookies } from "next/headers"
import type { EventFormState } from "@/lib/actions/admin.actions"
import { SESSION_COOKIE } from "@/lib/session-cookies"

// Host-side Server Actions. Every one checks the session first (they're public endpoints), and
// each service function checks ownership again, so a host can only ever touch their own things.

export type ActionState = { ok?: boolean; message?: string; errors?: Record<string, string> } | null

const str = (formData: FormData, key: string, max = 4000): string => {
  const value = formData.get(key)
  return typeof value === "string" ? value.slice(0, max) : ""
}

// ---------------------------------------------------------------- verification

export async function saveVerificationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireHost()
  const result = await saveVerification(session, formData)
  if (!result.ok) return { message: result.message, errors: result.errors }
  if (formData.get("intent") === "submit") redirect("/host/verification?sent=1")
  return { ok: true, message: "Saved. You can finish and send it any time." }
}

export async function submitAppealAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireHost()
  const result = await submitAppeal(session, formData)
  if (!result.ok) return { message: result.message, errors: result.errors }
  redirect("/host/verification?sent=1")
}

// ---------------------------------------------------------------- events

/** Create (slug null) or save a host event. Redirects after success. */
export async function saveHostEventAction(slug: string | null, _prev: EventFormState, formData: FormData): Promise<EventFormState> {
  const session = await requireHost()
  const result = await saveHostEvent(session, slug, formData)
  if (!result.ok) return { message: result.message, errors: result.errors }
  if (result.data?.revision) redirect("/host?notice=revision")
  if (formData.get("intent") === "submit") redirect("/host?notice=submitted")
  redirect(`/host/events/${result.data?.slug}/edit?saved=1`)
}

export async function deleteHostDraftAction(slug: string): Promise<ActionState> {
  const session = await requireHost()
  const result = await deleteHostDraft(session, slug)
  if (!result.ok) return { message: result.message }
  redirect("/host?notice=deleted")
}

export async function cancelHostEventAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireHost()
  const result = await cancelEvent(session, slug, str(formData, "reason", 2000))
  if (!result.ok) return { message: result.message }
  redirect("/host?notice=cancelled")
}

/** "Generate image" in the host event form. Inputs are re-checked in generateEventImage. */
export async function generateImageAction(_prev: GenerateResult | null, formData: FormData): Promise<GenerateResult> {
  const session = await requireHost()
  const references = formData.getAll("references").filter((v): v is File => v instanceof File && v.size > 0)
  const date = str(formData, "date", 10)
  return generateEventImage(session.user.id, {
    category: str(formData, "category", 40) as EventCategory,
    style: str(formData, "style", 20) as DesignStyle,
    title: str(formData, "title", 200),
    prompt: str(formData, "prompt", 600),
    description: str(formData, "description", 2000),
    includeDetails: formData.get("includeDetails") === "on",
    date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
    city: str(formData, "city", 80) || undefined,
    references,
  })
}

// ---------------------------------------------------------------- visitors

/** "Report this event" (no account needed). */
export async function reportEventAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const result = await createReport(slug, { reason: str(formData, "reason", 40), details: str(formData, "details", 2000), contactEmail: str(formData, "contactEmail", 254) })
  if (!result.ok) return { message: result.message }
  return { ok: true, message: "Thank you. Our team will look at this event." }
}

// ---------------------------------------------------------------- account settings (hosts and admins)

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireUser()
  const current = str(formData, "current", 300)
  const next = str(formData, "password", 300)
  if (next !== str(formData, "confirm", 300)) return { message: "The two new passwords don't match.", errors: { confirm: "Doesn't match" } }

  await connectDB()
  const user = await User.findById(session.user.id).select("+passwordHash").lean()
  if (!user) return { message: "Account not found." }
  // Accounts created with Google/GitHub have no password yet: they can add one without the old one.
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) return { message: "Your current password isn't right.", errors: { current: "Incorrect" } }
  const problem = await checkNewPassword(next, { email: user.email, name: user.name })
  if (problem) return { message: problem, errors: { password: problem } }

  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(next) }, $unset: { mustChangePassword: 1 } })
  // Other devices may know the old password: sign them out, keep this one.
  const others = await signOutEverywhere(session.user.id, session.sessionId)
  await logAction({ actor: actorOf(session), category: "security", action: "auth.password_changed", severity: "warning", summary: `${session.user.name} changed their password (${others} other sessions signed out)` })
  refresh()
  return { ok: true, message: "Password changed. Other devices were signed out." }
}

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  const session = await requireUser()
  if (!/^[a-f\d]{24}$/i.test(sessionId)) return { message: "Invalid session." }
  await connectDB()
  const { deletedCount } = await Session.deleteOne({ _id: sessionId, userId: session.user.id })
  if (deletedCount === 0) return { message: "That session has already ended." }
  await logAction({ actor: actorOf(session), category: "security", action: "auth.session_revoked", summary: `${session.user.name} signed out one of their devices` })
  refresh()
  return { ok: true, message: "Signed out." }
}

export async function signOutOtherSessionsAction(): Promise<ActionState> {
  const session = await requireUser()
  const count = await signOutEverywhere(session.user.id, session.sessionId)
  await logAction({ actor: actorOf(session), category: "security", action: "auth.sessions_revoked", severity: "warning", summary: `${session.user.name} signed out ${count} other device(s)` })
  refresh()
  return { ok: true, message: count === 0 ? "No other devices were signed in." : `Signed out ${count} other device(s).` }
}

/**
 * A host closes their account. Live events are cancelled (attendees emailed), personal details
 * are removed from the account, sessions end, and uploaded documents are deleted after 12 months
 * (kept that long in case of a dispute, as the privacy policy says).
 */
export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireHost()
  if (str(formData, "confirmText", 20).trim().toUpperCase() !== "DELETE") return { message: "Type DELETE to confirm.", errors: { confirmText: "Type DELETE" } }

  await connectDB()
  const user = await User.findById(session.user.id).select("+passwordHash").lean()
  if (!user) return { message: "Account not found." }
  if (user.passwordHash && !(await verifyPassword(str(formData, "password", 300), user.passwordHash))) return { message: "Your password isn't right.", errors: { password: "Incorrect" } }

  const cancelled = await cancelHostEvents(session.user.id, "The host closed their DevEvent account.")
  const deleteAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  await PrivateFile.updateMany({ ownerId: user._id }, { $set: { deleteAt } })
  await User.updateOne(
    { _id: user._id },
    {
      // The email is freed (unique index) so the person could sign up again later.
      $set: { status: "deleted", deletedAt: new Date(), email: `deleted-${user._id}@deleted.invalid`, name: "Deleted host", providers: [], knownDevices: [], knownCountries: [] },
      $unset: { passwordHash: 1, avatarUrl: 1, googleWorkspaceDomain: 1 },
    },
  )
  await signOutEverywhere(session.user.id)
  ;(await cookies()).delete(SESSION_COOKIE)
  await logAction({ actor: actorOf(session), category: "hosts", action: "host.account_deleted", severity: "critical", summary: `${session.user.name} (${session.user.email}) closed their host account; ${cancelled} live event(s) cancelled` })
  redirect("/?account=deleted")
}
