"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import QRCode from "qrcode"
import connectDB from "@/lib/mongodb"
import User from "@/database/user.model"
import { isDuplicateKeyError } from "@/database/event.model"
import { actorOf, requireAdmin, requireSuperAdmin, signOutEverywhere } from "@/lib/auth"
import { decideHost, recordOrgCheck, type HostDecision } from "@/lib/host.service"
import { cancelEvent, decideHostEvent, decideRevision, resolveReport, type EventDecision } from "@/lib/host-events.service"
import { issueToken } from "@/lib/accounts"
import { decryptString, encryptString, newBackupCodes, newTotpSecret, normalizeBackupCode, sha256, totpUri, verifyTotp } from "@/lib/crypto"
import { emailIsConfigured, sendAdminInvite, sendQuietly } from "@/lib/email"
import { logAction } from "@/lib/audit"
import { siteUrl as configuredSiteUrl } from "@/lib/site-url"

// Admin Server Actions behind the confirmation dialogs (components/admin/ConfirmAction.tsx).
// Each re-checks the role (they're public endpoints), and the services they call make the
// change atomically and write who did it to the activity log.

export type ConsoleState = { ok?: boolean; message?: string; data?: Record<string, unknown> } | null

const str = (formData: FormData, key: string, max = 2000): string => {
  const value = formData.get(key)
  return typeof value === "string" ? value.slice(0, max) : ""
}
const done = (result: { ok: boolean; message?: string }, success: string): ConsoleState => {
  if (!result.ok) return { message: result.message }
  refresh()
  return { ok: true, message: success }
}

// ---------------------------------------------------------------- host verification

export async function recordOrgCheckAction(profileId: string, orgId: string, outcome: "confirmed" | "denied" | "no_answer" | "note", _prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireAdmin()
  return done(await recordOrgCheck(admin, profileId, orgId, outcome, str(formData, "reason")), "Recorded.")
}

export async function decideHostAction(profileId: string, decision: HostDecision, _prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireAdmin()
  return done(await decideHost(admin, profileId, decision, str(formData, "reason")), "Done. The host has been emailed.")
}

// ---------------------------------------------------------------- events

export async function decideEventAction(slug: string, decision: EventDecision, _prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireAdmin()
  const result = await decideHostEvent(admin, slug, decision, str(formData, "reason"), str(formData, "pin", 20))
  if (!result.ok) return { message: result.message }
  redirect("/host/console/approvals?done=event")
}

export async function decideRevisionAction(revisionId: string, approve: boolean, _prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireAdmin()
  const result = await decideRevision(admin, revisionId, approve, str(formData, "reason"), str(formData, "pin", 20))
  if (!result.ok) return { message: result.message }
  redirect("/host/console/approvals?done=revision")
}

export async function resolveReportAction(reportId: string, action: "dismiss" | "cancel_event", _prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireAdmin()
  return done(await resolveReport(admin, reportId, action, str(formData, "reason")), "Report resolved.")
}

export async function cancelEventAsAdminAction(slug: string, _prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireAdmin()
  return done(await cancelEvent(admin, slug, str(formData, "reason"), { asAdmin: true }), "Event cancelled. Everyone who booked has been emailed.")
}

// ---------------------------------------------------------------- team (super admin only)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const siteUrl = (): string => configuredSiteUrl() || "http://localhost:3000"

/** Adds a supra admin and emails them an invite to set their password (48 hours). */
export async function inviteAdminAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const admin = await requireSuperAdmin()
  const name = str(formData, "name", 120).trim()
  const email = str(formData, "email", 254).trim().toLowerCase()
  if (name.length < 2) return { message: "Enter their full name." }
  if (!EMAIL.test(email)) return { message: "Enter a valid email address." }

  await connectDB()
  let user
  try {
    user = await User.create({ email, name, role: "supra_admin", status: "invited", invitedBy: admin.user.id })
  } catch (e) {
    if (e instanceof Error && isDuplicateKeyError(e)) return { message: "That email already has an account. Hosts can't be turned into admins; use a different address." }
    throw e
  }
  const url = `${siteUrl()}/host/accept-invite?token=${await issueToken(user._id, "admin_invite")}`
  const sent = await sendQuietly("admin invite", () => sendAdminInvite(email, { name, inviterName: admin.user.name, url }))
  await logAction({ actor: actorOf(admin), category: "team", action: "team.invite", severity: "critical", summary: `${admin.user.name} invited ${name} (${email}) as a supra admin`, target: { type: "user", id: user._id.toString(), label: email } })
  refresh()
  if (!sent) {
    return emailIsConfigured()
      ? { message: "The account was created but the invite email failed. Use \"Resend invite\"." }
      : { ok: true, message: "Email isn't set up, so send them this link yourself (it expires in 48 hours):", data: { link: url } }
  }
  return { ok: true, message: `Invite sent to ${email}.` }
}

export async function resendInviteAction(userId: string): Promise<ConsoleState> {
  const admin = await requireSuperAdmin()
  await connectDB()
  const user = await User.findOne({ _id: userId, role: "supra_admin", status: "invited" }).lean()
  if (!user) return { message: "This invite was already accepted or removed." }
  const url = `${siteUrl()}/host/accept-invite?token=${await issueToken(user._id, "admin_invite")}`
  const sent = await sendQuietly("admin invite", () => sendAdminInvite(user.email, { name: user.name, inviterName: admin.user.name, url }))
  await logAction({ actor: actorOf(admin), category: "team", action: "team.invite_resent", summary: `${admin.user.name} resent the invite to ${user.email}` })
  return sent ? { ok: true, message: "Invite sent again." } : { ok: true, message: "Email isn't set up; send this link:", data: { link: url } }
}

/**
 * Suspend, reactivate or remove a supra admin. The super admin's own account can never be
 * changed here (the query only matches supra admins), and every session of the person ends
 * immediately on suspension or removal.
 */
export async function setAdminStatusAction(userId: string, change: "suspend" | "reactivate" | "remove"): Promise<ConsoleState> {
  const admin = await requireSuperAdmin()
  if (!/^[a-f\d]{24}$/i.test(userId)) return { message: "Invalid account." }
  await connectDB()
  const target = await User.findOne({ _id: userId, role: "supra_admin" }).lean()
  if (!target) return { message: "Only supra admins can be changed here." }

  if (change === "remove") {
    await User.updateOne(
      { _id: target._id, role: "supra_admin" },
      // The email is freed (so the person could be invited again later) and every credential is removed.
      { $set: { status: "deleted", deletedAt: new Date(), email: `deleted-${target._id}@deleted.invalid`, backupCodeHashes: [] }, $unset: { passwordHash: 1, totpSecretEncrypted: 1, totpEnabledAt: 1 } },
    )
  } else {
    await User.updateOne({ _id: target._id, role: "supra_admin", status: { $ne: "deleted" } }, { $set: { status: change === "suspend" ? "suspended" : "active" } })
  }
  if (change !== "reactivate") await signOutEverywhere(userId)

  await logAction({
    actor: actorOf(admin),
    category: "team",
    action: `team.${change}`,
    severity: "critical",
    summary: `${admin.user.name} ${change === "remove" ? "removed" : change === "suspend" ? "suspended" : "reactivated"} the supra admin ${target.name} (${target.email})`,
    target: { type: "user", id: userId, label: target.email },
  })
  refresh()
  return { ok: true, message: "Done." }
}

// ---------------------------------------------------------------- security: authenticator app

/** Step 1: a new secret (stored encrypted, not active yet) and its QR code. */
export async function startTotpSetupAction(): Promise<ConsoleState> {
  const session = await requireAdmin({ setupPage: true })
  await connectDB()
  const secret = newTotpSecret()
  // Not active until a code from the app is confirmed (step 2), so a half-finished setup can't lock anyone out.
  await User.updateOne({ _id: session.user.id, totpEnabledAt: { $exists: false } }, { $set: { totpSecretEncrypted: encryptString(secret) } })
  const uri = totpUri(secret, session.user.email)
  return { ok: true, data: { secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) } }
}

/** Step 2: the first code proves the app works; then it's switched on and backup codes are shown once. */
export async function confirmTotpSetupAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await requireAdmin({ setupPage: true })
  await connectDB()
  const user = await User.findById(session.user.id).select("+totpSecretEncrypted").lean()
  if (!user?.totpSecretEncrypted) return { message: "Start the setup first." }
  if (user.totpEnabledAt) return { message: "Your authenticator is already set up." }
  const step = verifyTotp(decryptString(user.totpSecretEncrypted), str(formData, "code", 10))
  if (step === null) return { message: "That code isn't right. Check the time on your phone is set automatically, then try the newest code." }

  const codes = newBackupCodes()
  await User.updateOne(
    { _id: user._id },
    { $set: { totpEnabledAt: new Date(), totpLastUsedStep: step, backupCodeHashes: codes.map((c) => sha256(normalizeBackupCode(c))) } },
  )
  await logAction({ actor: actorOf(session), category: "security", action: "auth.totp_enabled", severity: "warning", summary: `${session.user.name} set up their authenticator app` })
  return { ok: true, data: { backupCodes: codes } }
}

/** New backup codes (the old ones stop working). Needs a current authenticator code. */
export async function regenerateBackupCodesAction(_prev: ConsoleState, formData: FormData): Promise<ConsoleState> {
  const session = await requireAdmin({ setupPage: true })
  await connectDB()
  const user = await User.findById(session.user.id).select("+totpSecretEncrypted +totpLastUsedStep").lean()
  if (!user?.totpSecretEncrypted || !user.totpEnabledAt) return { message: "Set up your authenticator first." }
  const step = verifyTotp(decryptString(user.totpSecretEncrypted), str(formData, "code", 10), user.totpLastUsedStep)
  if (step === null) return { message: "That code isn't right." }
  const codes = newBackupCodes()
  await User.updateOne({ _id: user._id }, { $set: { totpLastUsedStep: step, backupCodeHashes: codes.map((c) => sha256(normalizeBackupCode(c))) } })
  await logAction({ actor: actorOf(session), category: "security", action: "auth.backup_codes_regenerated", severity: "warning", summary: `${session.user.name} made new backup codes` })
  return { ok: true, data: { backupCodes: codes } }
}
