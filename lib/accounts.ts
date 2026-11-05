import "server-only"
import type { Types } from "mongoose"
import { connection } from "next/server"
import connectDB from "@/lib/mongodb"
import User, { type IUser } from "@/database/user.model"
import OneTimeToken, { type TokenPurpose } from "@/database/one-time-token.model"
import { isDuplicateKeyError } from "@/database/event.model"
import { hashPassword, randomToken, sha256 } from "@/lib/crypto"
import { checkNewPassword } from "@/lib/passwords"
import { completeSignIn, signOutEverywhere, type SignInResult } from "@/lib/auth"
import { emailIsConfigured, sendEmailVerification, sendPasswordReset, sendQuietly, sendSignupExistingAccount } from "@/lib/email"
import { LIMITS, clientIp, consumeAttempt } from "@/lib/rate-limit"
import { logAction } from "@/lib/audit"
import type { OAuthProfile } from "@/lib/oauth"

// Account life cycle outside the sign-in form itself: Google/GitHub sign-in, email sign-up and
// confirmation, password reset and admin invites. Each emailed link is a one-time token
// (database/one-time-token.model.ts): only its hash is stored, and using it deletes it.

const HOUR = 60 * 60 * 1000
const TOKEN_LIFETIME: Record<Exclude<TokenPurpose, "login_challenge">, number> = {
  email_verify: 24 * HOUR,
  password_reset: 1 * HOUR,
  admin_invite: 48 * HOUR,
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const siteUrl = (): string => (process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "")

/** Creates a link token for `userId` (replacing older ones for the same purpose) and returns the raw token. */
export async function issueToken(userId: Types.ObjectId | string, purpose: Exclude<TokenPurpose, "login_challenge">): Promise<string> {
  const token = randomToken()
  await OneTimeToken.deleteMany({ userId, purpose })
  await OneTimeToken.create({ purpose, tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + TOKEN_LIFETIME[purpose]) })
  return token
}

/** Uses up a link token: one atomic find-and-delete, so the same link can't work twice. */
async function consumeToken(purpose: TokenPurpose, token: string): Promise<Types.ObjectId | null> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null
  const record = await OneTimeToken.findOneAndDelete({ purpose, tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean()
  return record?.userId ?? null
}

/** Whether a link is still valid, without using it up (pages show a form only for live links). */
export async function tokenIsValid(purpose: TokenPurpose, token: string | undefined): Promise<boolean> {
  // Compares against the current time: request time only, never during a prerender.
  await connection()
  if (!token || token.length < 20 || token.length > 100) return false
  try {
    await connectDB()
    return Boolean(await OneTimeToken.exists({ purpose, tokenHash: sha256(token), expiresAt: { $gt: new Date() } }))
  } catch (e) {
    console.error("Token check failed:", e)
    return false
  }
}

// ---------------------------------------------------------------- Google / GitHub

/**
 * After Google/GitHub confirms who someone is: finds their account (by provider id, then by
 * verified email, linking the provider), or creates a host account. Then signs them in.
 */
export async function signInWithOAuth(profile: OAuthProfile, next?: string | null): Promise<SignInResult & { isNew?: boolean }> {
  // Only a verified address can be trusted to belong to this person; linking on an unverified one
  // would let anyone take over an account by adding someone else's email to their GitHub.
  if (!profile.emailVerified || !EMAIL_REGEX.test(profile.email)) {
    return { ok: false, error: `Your ${profile.provider === "google" ? "Google" : "GitHub"} account doesn't have a verified email address. Verify it there, or sign up with email instead.` }
  }

  await connectDB()
  let user: IUser | null = await User.findOne({ "providers.provider": profile.provider, "providers.providerId": profile.providerId }).lean()
  let isNew = false

  if (!user) {
    const existing = await User.findOne({ email: profile.email }).lean()
    if (existing) {
      // Same verified email: this is the same person, so the provider is linked to their account.
      await User.updateOne(
        { _id: existing._id },
        {
          $push: { providers: { provider: profile.provider, providerId: profile.providerId, linkedAt: new Date() } },
          $set: { ...(existing.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }), ...(profile.workspaceDomain ? { googleWorkspaceDomain: profile.workspaceDomain } : {}) },
        },
      )
      user = await User.findById(existing._id).lean()
      await logAction({ actor: user && { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "security", action: "auth.provider_linked", severity: "warning", summary: `${profile.provider} sign-in linked to ${profile.email}` })
    } else {
      try {
        const created = await User.create({
          email: profile.email,
          name: profile.name.slice(0, 120),
          role: "host",
          status: "active",
          emailVerifiedAt: new Date(),
          providers: [{ provider: profile.provider, providerId: profile.providerId, linkedAt: new Date() }],
          avatarUrl: profile.avatarUrl,
          googleWorkspaceDomain: profile.workspaceDomain,
        })
        user = created.toObject()
        isNew = true
        await logAction({ actor: { id: created._id.toString(), email: created.email, name: created.name, role: "host" }, category: "auth", action: "auth.signup", summary: `${created.name} created a host account with ${profile.provider}` })
      } catch (e) {
        // Two callbacks at once: the unique index lets only one create it; use that one.
        if (e instanceof Error && isDuplicateKeyError(e)) user = await User.findOne({ email: profile.email }).lean()
        else throw e
      }
    }
  }

  if (!user) return { ok: false, error: "We couldn't sign you in. Please try again." }
  if (user.status === "suspended") return { ok: false, error: "This account is suspended. Contact us if you think this is a mistake." }
  if (user.status === "deleted") return { ok: false, error: "This account was closed." }
  if (user.status === "invited") return { ok: false, error: "Finish setting up your account from the invite email first." }

  const result = await completeSignIn(user, { method: profile.provider === "google" ? "Google" : "GitHub", next })
  return { ...result, isNew }
}

// ---------------------------------------------------------------- email sign-up

export type SignUpResult = { ok: true; devLink?: string } | { ok: false; error: string; field?: string }

/**
 * Creates an unconfirmed host account and emails a confirmation link. If the address already
 * has an account, the owner gets a "you already have an account" email instead and the page
 * says the same thing either way, so this form can't be used to find out who has an account.
 */
export async function signUpHost({ name, email: rawEmail, password }: { name: string; email: string; password: string }): Promise<SignUpResult> {
  const email = rawEmail.trim().toLowerCase()
  const cleanName = name.trim()
  if (cleanName.length < 2 || cleanName.length > 120) return { ok: false, error: "Enter your full name.", field: "name" }
  if (!EMAIL_REGEX.test(email) || email.length > 254) return { ok: false, error: "Enter a valid email address.", field: "email" }
  const passwordProblem = await checkNewPassword(password, { email, name: cleanName })
  if (passwordProblem) return { ok: false, error: passwordProblem, field: "password" }

  if (!(await consumeAttempt(`signup:${await clientIp()}`, LIMITS.signup))) {
    return { ok: false, error: "Too many sign-ups from this network. Please try again in an hour." }
  }
  if (!emailIsConfigured() && process.env.NODE_ENV === "production") {
    return { ok: false, error: "Sign-up by email is temporarily unavailable. Please use Google or GitHub." }
  }

  await connectDB()
  const existing = await User.findOne({ email }).lean()
  if (existing) {
    await sendQuietly("existing account notice", () => sendSignupExistingAccount(email, `${siteUrl()}/host/login`, `${siteUrl()}/host/forgot-password`))
    return { ok: true }
  }

  let user
  try {
    user = await User.create({ email, name: cleanName, role: "host", status: "active", passwordHash: await hashPassword(password) })
  } catch (e) {
    if (e instanceof Error && isDuplicateKeyError(e)) return { ok: true } // a parallel sign-up won the race
    throw e
  }

  const url = `${siteUrl()}/host/verify-email?token=${await issueToken(user._id, "email_verify")}`
  await logAction({ actor: { id: user._id.toString(), email, name: cleanName, role: "host" }, category: "auth", action: "auth.signup", summary: `${cleanName} created a host account with email` })

  if (!emailIsConfigured()) {
    console.warn(`[dev] SMTP isn't configured. Confirmation link for ${email}:\n  ${url}`)
    return { ok: true, devLink: url }
  }
  try {
    await sendEmailVerification(email, cleanName, url)
  } catch (e) {
    console.error("Verification email failed:", e)
    return { ok: false, error: "Your account was created, but we couldn't send the confirmation email. Use \"Resend link\" on the sign-in page." }
  }
  return { ok: true }
}

/** "Resend link": quietly does nothing for unknown or already-confirmed addresses. */
export async function resendVerification(rawEmail: string): Promise<{ devLink?: string }> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_REGEX.test(email)) return {}
  if (!(await consumeAttempt(`email-link:${email}`, LIMITS.emailLink))) return {}
  await connectDB()
  const user = await User.findOne({ email, emailVerifiedAt: { $exists: false }, status: "active" }).lean()
  if (!user) return {}
  const url = `${siteUrl()}/host/verify-email?token=${await issueToken(user._id, "email_verify")}`
  if (!emailIsConfigured()) {
    console.warn(`[dev] Confirmation link for ${email}:\n  ${url}`)
    return process.env.NODE_ENV === "production" ? {} : { devLink: url }
  }
  await sendQuietly("verification resend", () => sendEmailVerification(email, user.name, url))
  return {}
}

/** The confirmation link was clicked (and the button pressed): mark the email verified and sign in. */
export async function confirmEmail(token: string): Promise<SignInResult> {
  await connectDB()
  const userId = await consumeToken("email_verify", token)
  if (!userId) return { ok: false, error: "This link is invalid, expired or already used. Sign in to get a new one." }
  const user = await User.findOneAndUpdate({ _id: userId, status: "active" }, { $set: { emailVerifiedAt: new Date() } }, { returnDocument: "after" }).lean()
  if (!user) return { ok: false, error: "This account can't be used." }
  await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "auth", action: "auth.email_verified", summary: `${user.name} confirmed their email` })
  return completeSignIn(user, { method: "email link" })
}

// ---------------------------------------------------------------- password reset

/** Always looks the same from outside, whether or not the account exists. */
export async function requestPasswordReset(rawEmail: string): Promise<{ devLink?: string }> {
  const email = rawEmail.trim().toLowerCase()
  if (!EMAIL_REGEX.test(email)) return {}
  if (!(await consumeAttempt(`email-link:${email}`, LIMITS.emailLink)) || !(await consumeAttempt(`reset-ip:${await clientIp()}`, LIMITS.emailLink))) return {}

  await connectDB()
  const user = await User.findOne({ email, status: "active" }).lean()
  if (!user) return {}
  const url = `${siteUrl()}/host/reset-password?token=${await issueToken(user._id, "password_reset")}`
  await logAction({ actor: { id: user._id.toString(), email, name: user.name, role: user.role }, category: "security", action: "auth.reset_requested", summary: `Password reset requested for ${email}` })
  if (!emailIsConfigured()) {
    console.warn(`[dev] Password reset link for ${email}:\n  ${url}`)
    return process.env.NODE_ENV === "production" ? {} : { devLink: url }
  }
  await sendQuietly("password reset", () => sendPasswordReset(email, user.name, url))
  return {}
}

/** Sets a new password from a reset link, and signs out every device (the old password may be known). */
export async function resetPassword(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectDB()
  const tokenHash = sha256(token)
  const record = await OneTimeToken.findOne({ purpose: "password_reset", tokenHash, expiresAt: { $gt: new Date() } }).lean()
  if (!record) return { ok: false, error: "This link is invalid, expired or already used. Ask for a new one." }
  const user = await User.findById(record.userId).lean()
  if (!user || user.status !== "active") return { ok: false, error: "This account can't be used." }

  // Checked before the link is used up, so a weak password doesn't waste the link.
  const problem = await checkNewPassword(password, { email: user.email, name: user.name })
  if (problem) return { ok: false, error: problem }

  if (!(await consumeToken("password_reset", token))) return { ok: false, error: "This link was just used. Ask for a new one." }
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(password), emailVerifiedAt: user.emailVerifiedAt ?? new Date() }, $unset: { mustChangePassword: 1 } })
  const signedOut = await signOutEverywhere(user._id.toString())
  await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "security", action: "auth.password_reset", severity: "warning", summary: `${user.name} reset their password (${signedOut} sessions signed out)` })
  return { ok: true }
}

// ---------------------------------------------------------------- admin invites

/** A new supra admin sets their password from the invite email. They sign in normally afterwards. */
export async function acceptInvite(token: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await connectDB()
  const record = await OneTimeToken.findOne({ purpose: "admin_invite", tokenHash: sha256(token), expiresAt: { $gt: new Date() } }).lean()
  if (!record) return { ok: false, error: "This invite is invalid or has expired. Ask the super admin for a new one." }
  const user = await User.findById(record.userId).lean()
  if (!user || user.status !== "invited") return { ok: false, error: "This invite has already been used." }

  const problem = await checkNewPassword(password, { email: user.email, name: user.name })
  if (problem) return { ok: false, error: problem }

  if (!(await consumeToken("admin_invite", token))) return { ok: false, error: "This invite was just used." }
  await User.updateOne({ _id: user._id, status: "invited" }, { $set: { status: "active", passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } })
  await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "team", action: "team.invite_accepted", summary: `${user.name} accepted their admin invite` })
  return { ok: true }
}
