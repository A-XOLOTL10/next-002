import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import connectDB from "@/lib/mongodb"
import User, { type IUser } from "@/database/user.model"
import Session from "@/database/session.model"
import OneTimeToken from "@/database/one-time-token.model"
import { isDuplicateKeyError } from "@/database/event.model"
import { isAdminRole, type Role } from "@/database/user.constants"
import { CHALLENGE_COOKIE, DEVICE_COOKIE, SESSION_COOKIE } from "@/lib/session-cookies"
import { LIMITS, clearAttempts, clientIp, consumeAttempt } from "@/lib/rate-limit"
import { getAppSecret, hashPassword, normalizeBackupCode, randomCode, randomToken, safeEqual, sha256, verifyPassword, verifyTotp, decryptString } from "@/lib/crypto"
import { describeDevice, describePlace, getRequestInfo, type RequestInfo } from "@/lib/request-info"
import { emailIsConfigured, sendLoginCode, sendNewSignInAlert, sendQuietly } from "@/lib/email"
import { logAction, type Actor } from "@/lib/audit"

// Sign-in for everyone with an account: hosts, supra admins and the super admin.
//
//   password or Google/GitHub ──> completeSignIn ──> (admins only) extra checks ──> session
//
// Sessions live in the database (database/session.model.ts); the browser holds only a random
// token. Admin sessions end after 8 hours, or 30 minutes without activity. Admins always enter
// their authenticator code, and a sign-in from a new device or country also needs a code sent
// by email; the super admin is alerted when that happens.

const HOUR = 60 * 60 * 1000
const SESSION_LENGTH: Record<"admin" | "host", number> = { admin: 8 * HOUR, host: 14 * 24 * HOUR }
const ADMIN_IDLE_MS = 30 * 60 * 1000
const CHALLENGE_MS = 10 * 60 * 1000
const MAX_CHALLENGE_TRIES = 5
const LAST_SEEN_THROTTLE_MS = 60 * 1000

const secureCookies = process.env.NODE_ENV === "production"

export type CurrentUser = {
  id: string
  email: string
  name: string
  role: Role
  avatarUrl?: string
  onboarded: boolean
  totpEnabled: boolean
  mustChangePassword: boolean
  hasPassword: boolean
}

export type CurrentSession = { sessionId: string; user: CurrentUser }

const toCurrentUser = (user: Pick<IUser, "_id" | "email" | "name" | "role" | "avatarUrl" | "onboardedAt" | "totpEnabledAt" | "mustChangePassword"> & { passwordHash?: string }): CurrentUser => ({
  id: user._id.toString(),
  email: user.email,
  name: user.name,
  role: user.role,
  avatarUrl: user.avatarUrl,
  onboarded: Boolean(user.onboardedAt),
  totpEnabled: Boolean(user.totpEnabledAt),
  mustChangePassword: Boolean(user.mustChangePassword),
  hasPassword: Boolean(user.passwordHash),
})

/** The activity log's "who": built from the current session. */
export const actorOf = (session: CurrentSession | null): Actor | null =>
  session && { id: session.user.id, email: session.user.email, name: session.user.name, role: session.user.role, sessionId: session.sessionId }

// ---------------------------------------------------------------- reading the session

/**
 * The signed-in user for this request, or null. Cached per request (React cache), so pages,
 * layouts and data functions can all call it without extra database reads.
 */
export const getSession = cache(async (): Promise<CurrentSession | null> => {
  // Reads the clock and cookies: never part of a prerender.
  await connection()

  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token || token.length > 200) return null

  try {
    await connectDB()
    const session = await Session.findOne({ tokenHash: sha256(token) }).lean()
    if (!session) return null

    const now = Date.now()
    if (session.expiresAt.getTime() <= now) return null
    // Admins are signed out after 30 idle minutes: an unattended laptop can't be used for long.
    if (isAdminRole(session.role) && now - session.lastSeenAt.getTime() > ADMIN_IDLE_MS) {
      await Session.deleteOne({ _id: session._id })
      return null
    }

    const user = await User.findById(session.userId).select("+passwordHash").lean()
    // A suspended, deleted or re-roled account loses every session at once.
    if (!user || user.status !== "active" || user.role !== session.role) return null

    if (now - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
      Session.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date(now) } }).catch((e: unknown) => console.error("Session touch failed:", e))
    }

    return { sessionId: session._id.toString(), user: toCurrentUser(user) }
  } catch (e) {
    console.error("Session check failed:", e)
    return null
  }
})

export const getCurrentUser = async (): Promise<CurrentUser | null> => (await getSession())?.user ?? null

/** True for a signed-in super or supra admin. For API routes, which answer 401 instead of redirecting. */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession()
  return Boolean(session && isAdminRole(session.user.role) && session.user.totpEnabled)
}

/** Any signed-in account. Otherwise to the sign-in page. */
export async function requireUser(): Promise<CurrentSession> {
  const session = await getSession()
  if (!session) redirect("/host/login")
  return session
}

/** Hosts only. Admins who wander into the host area are sent to the console. */
export async function requireHost(): Promise<CurrentSession> {
  const session = await requireUser()
  if (session.user.role !== "host") redirect("/host/console")
  return session
}

/**
 * Super or supra admins. Hosts are sent back to their dashboard, so the console's existence
 * isn't confirmed to them. Admins must have their authenticator app set up (and must replace a
 * temporary password) before anything else; `setupPage` is the security page itself.
 */
export async function requireAdmin({ setupPage = false } = {}): Promise<CurrentSession> {
  const session = await requireUser()
  if (!isAdminRole(session.user.role)) redirect("/host")
  if (!setupPage && (!session.user.totpEnabled || session.user.mustChangePassword)) redirect("/host/console/security")
  return session
}

/** The super admin only (team management, activity log). Supra admins are sent to the console home. */
export async function requireSuperAdmin(): Promise<CurrentSession> {
  const session = await requireAdmin()
  if (session.user.role !== "super_admin") redirect("/host/console")
  return session
}

// ---------------------------------------------------------------- sessions

async function deviceHashFromCookie(createIfMissing: boolean): Promise<string> {
  const jar = await cookies()
  let deviceId = jar.get(DEVICE_COOKIE)?.value
  if (!deviceId || deviceId.length > 100) {
    deviceId = randomToken(24)
    if (createIfMissing) {
      jar.set(DEVICE_COOKIE, deviceId, { httpOnly: true, secure: secureCookies, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 730 })
    }
  }
  return sha256(deviceId)
}

/** Starts a session for `user` and sets the cookie. Only callable from a Server Action or Route Handler. */
async function createSession(user: Pick<IUser, "_id" | "role">, info: RequestInfo, deviceHash: string): Promise<string> {
  const token = randomToken()
  const length = isAdminRole(user.role) ? SESSION_LENGTH.admin : SESSION_LENGTH.host
  const now = new Date()
  const expiresAt = new Date(now.getTime() + length)
  const session = await Session.create({
    tokenHash: sha256(token),
    userId: user._id,
    role: user.role,
    ip: info.ip,
    country: info.country,
    city: info.city,
    userAgent: info.userAgent,
    deviceHash,
    lastSeenAt: now,
    expiresAt,
  })
  ;(await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: secureCookies, sameSite: "lax", path: "/", expires: expiresAt })
  return session._id.toString()
}

/** Signs this browser out (deletes the session row and the cookie). */
export async function signOut(): Promise<void> {
  const session = await getSession()
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) {
    try {
      await connectDB()
      await Session.deleteOne({ tokenHash: sha256(token) })
    } catch (e) {
      console.error("Sign-out failed to delete the session:", e)
    }
  }
  jar.delete(SESSION_COOKIE)
  if (session) await logAction({ actor: actorOf(session), category: "auth", action: "auth.logout", summary: `${session.user.name} signed out` })
}

/** Ends every session for a user (password change, suspension, "sign out everywhere"). */
export async function signOutEverywhere(userId: string, exceptSessionId?: string): Promise<number> {
  await connectDB()
  const filter = exceptSessionId ? { userId, _id: { $ne: exceptSessionId } } : { userId }
  const { deletedCount } = await Session.deleteMany(filter)
  return deletedCount
}

// ---------------------------------------------------------------- signing in

export type SignInResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; unverifiedEmail?: string }
  | { ok: "challenge"; redirectTo: string }

/** Where to go after signing in: a safe /host path from ?next=, else by role. */
export function landingFor(user: Pick<CurrentUser, "role" | "onboarded">, next?: string | null): string {
  const isSafe = typeof next === "string" && next.startsWith("/host") && !next.startsWith("//") && !next.includes("\\")
  if (isAdminRole(user.role)) return isSafe && next.startsWith("/host/console") ? next : "/host/console"
  if (!user.onboarded) return "/host/welcome"
  return isSafe && !next.startsWith("/host/console") && !next.startsWith("/host/login") ? next : "/host"
}

/**
 * First run: if no super admin exists yet, the ADMIN_EMAIL / ADMIN_PASSWORD environment values
 * create one in the database. After that the database account is the only source of truth:
 * changing the env vars does nothing, and ADMIN_PASSWORD can be removed from Vercel.
 */
async function bootstrapSuperAdmin(email: string, password: string): Promise<IUser | null> {
  const envEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const envPassword = process.env.ADMIN_PASSWORD
  if (!envEmail || !envPassword) return null
  // Both compared every time, so timing doesn't reveal which one matched.
  const matches = safeEqual(email, envEmail) && safeEqual(password, envPassword)
  if (!matches) return null
  if (await User.exists({ role: "super_admin" })) return null

  try {
    const user = await User.create({
      email: envEmail,
      name: process.env.ADMIN_NAME?.trim() || "Super Admin",
      role: "super_admin",
      status: "active",
      passwordHash: await hashPassword(envPassword),
      emailVerifiedAt: new Date(),
      // A short env password must be replaced on first sign-in.
      mustChangePassword: envPassword.length < 12,
    })
    await logAction({ category: "team", action: "team.bootstrap", severity: "critical", summary: `Super admin account created for ${envEmail} from environment settings`, target: { type: "user", id: user._id.toString(), label: envEmail } })
    return user.toObject()
  } catch (e) {
    // Two first sign-ins at once: the unique index lets only one create the account.
    if (e instanceof Error && isDuplicateKeyError(e)) return User.findOne({ email: envEmail }).lean()
    throw e
  }
}

/** Email + password sign-in, from the login form. Sets cookies, so Server Actions only. */
export async function signInWithPassword(rawEmail: string, password: string, next?: string | null): Promise<SignInResult> {
  const email = rawEmail.trim().toLowerCase()
  try {
    getAppSecret()
  } catch (e) {
    console.error("Sign-in isn't configured:", e instanceof Error ? e.message : e)
    return { ok: false, error: "Sign-in isn't set up on the server yet." }
  }

  // Counted before the password is checked, so parallel guesses can't slip under the limits.
  const ipKey = `login:${await clientIp()}`
  const accountKey = `login-account:${email}`
  if (
    !(await consumeAttempt(ipKey, LIMITS.login, { failClosed: true })) ||
    !(await consumeAttempt(accountKey, LIMITS.loginAccount, { failClosed: true })) ||
    !(await consumeAttempt("login:all", LIMITS.loginAll, { failClosed: true }))
  ) {
    return { ok: false, error: "Too many sign-in attempts. Please wait 15 minutes and try again." }
  }

  try {
    await connectDB()
    let user: IUser | null = await User.findOne({ email }).select("+passwordHash").lean()
    if (!user) user = await bootstrapSuperAdmin(email, password)

    // verifyPassword does the same work for a missing account, so timing doesn't reveal which emails exist.
    const valid = await verifyPassword(password, user?.passwordHash)
    if (!user || !valid || user.status === "deleted") {
      await logAction({ category: "auth", action: "auth.login_failed", severity: "warning", summary: `Failed sign-in for ${email}`, target: { type: "user", id: user?._id.toString(), label: email } })
      return { ok: false, error: "That email and password don't match an account." }
    }
    if (user.status === "suspended") return { ok: false, error: "This account is suspended. Contact us if you think this is a mistake." }
    if (user.status === "invited") return { ok: false, error: "Finish setting up your account from the invite email first." }
    if (!user.emailVerifiedAt) return { ok: false, error: "Please confirm your email first. We can send the link again.", unverifiedEmail: email }

    await clearAttempts(ipKey, accountKey)
    return completeSignIn(user, { method: "password", next })
  } catch (e) {
    console.error("Sign-in failed:", e)
    return { ok: false, error: "We couldn't sign you in right now. Please try again." }
  }
}

type ChallengeStep = "totp" | "email"
type ChallengeMeta = {
  steps: ChallengeStep[]
  deviceHash: string
  info: RequestInfo
  next?: string | null
  method: string
  risky: boolean
  reasons: string[]
}

/**
 * The common end of every sign-in (password, Google, GitHub, email link). Hosts get a session
 * straight away. Admins first pass their authenticator code, plus an emailed code when the
 * device or country is new.
 */
export async function completeSignIn(user: IUser, { method, next }: { method: string; next?: string | null }): Promise<SignInResult> {
  const info = await getRequestInfo()
  const deviceHash = await deviceHashFromCookie(true)

  if (!isAdminRole(user.role)) {
    const sessionId = await createSession(user, info, deviceHash)
    await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() }, $addToSet: { knownDevices: deviceHash, ...(info.country ? { knownCountries: info.country } : {}) } })
    await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role, sessionId }, category: "auth", action: "auth.login", summary: `${user.name} signed in with ${method}` })
    return { ok: true, redirectTo: landingFor(toCurrentUser(user), next) }
  }

  // Admins: decide which extra steps this sign-in needs.
  const full = await User.findById(user._id).select("+knownDevices").lean()
  const knownDevices = full?.knownDevices ?? []
  const knownCountries = full?.knownCountries ?? []
  const reasons: string[] = []
  if (!knownDevices.includes(deviceHash)) reasons.push("new device")
  if (info.country && knownCountries.length > 0 && !knownCountries.includes(info.country)) reasons.push(`new country (${info.country})`)
  const risky = reasons.length > 0

  const steps: ChallengeStep[] = []
  if (user.totpEnabledAt) steps.push("totp")
  if (risky) steps.push("email")

  if (steps.length === 0) return finishChallenge(user, { steps, deviceHash, info, next, method, risky, reasons })

  // Store the pending sign-in; the browser only gets a random handle to it.
  const handle = randomToken()
  const code = steps.includes("email") ? randomCode() : null
  await OneTimeToken.deleteMany({ userId: user._id, purpose: "login_challenge" })
  await OneTimeToken.create({
    purpose: "login_challenge",
    tokenHash: sha256(handle),
    userId: user._id,
    codeHash: code ? sha256(code) : undefined,
    meta: { steps, deviceHash, info, next, method, risky, reasons } satisfies ChallengeMeta,
    expiresAt: new Date(Date.now() + CHALLENGE_MS),
  })

  if (code) {
    if (emailIsConfigured()) {
      try {
        await sendLoginCode(user.email, { name: user.name, code, place: describePlace(info), device: describeDevice(info.userAgent) })
      } catch (e) {
        console.error("Sign-in code email failed:", e)
        return { ok: false, error: "We couldn't email your sign-in code. Please try again in a minute." }
      }
    } else if (process.env.NODE_ENV !== "production") {
      console.warn(`[dev] SMTP isn't configured. Sign-in code for ${user.email}: ${code}`)
    } else {
      // Fail closed: without email there's no way to check an unusual admin sign-in.
      console.error("Admin sign-in refused: a code is needed but SMTP isn't configured.")
      return { ok: false, error: "We couldn't verify this sign-in. Please contact the site owner." }
    }
  }

  ;(await cookies()).set(CHALLENGE_COOKIE, handle, { httpOnly: true, secure: secureCookies, sameSite: "lax", path: "/", maxAge: CHALLENGE_MS / 1000 })
  await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "auth", action: "auth.challenge_started", severity: risky ? "warning" : "info", summary: `${user.name} passed the password step; extra checks: ${steps.join(" + ")}${risky ? ` (${reasons.join(", ")})` : ""}` })
  return { ok: "challenge", redirectTo: "/host/login/verify" }
}

/** What the "confirm it's you" page shows: the next step, or null when there's no sign-in waiting. */
export async function getPendingChallenge(): Promise<{ step: ChallengeStep; email: string } | null> {
  await connection()
  const handle = (await cookies()).get(CHALLENGE_COOKIE)?.value
  if (!handle) return null
  try {
    await connectDB()
    const record = await OneTimeToken.findOne({ tokenHash: sha256(handle), purpose: "login_challenge", expiresAt: { $gt: new Date() } }).lean()
    const meta = record?.meta as ChallengeMeta | undefined
    if (!record || !meta?.steps.length) return null
    const user = await User.findById(record.userId).select("email").lean()
    if (!user) return null
    // Shows "a***@gmail.com", so the page confirms which inbox without revealing the address.
    const [local, domain] = user.email.split("@")
    return { step: meta.steps[0], email: `${local.slice(0, 1)}***@${domain}` }
  } catch (e) {
    console.error("Challenge lookup failed:", e)
    return null
  }
}

/** Checks the code for the current step. On the last step, starts the session. */
export async function verifyChallenge(rawCode: string): Promise<SignInResult> {
  const jar = await cookies()
  const handle = jar.get(CHALLENGE_COOKIE)?.value
  const expired: SignInResult = { ok: false, error: "This sign-in has expired. Please sign in again." }
  if (!handle) return expired

  await connectDB()
  const record = await OneTimeToken.findOne({ tokenHash: sha256(handle), purpose: "login_challenge", expiresAt: { $gt: new Date() } })
  const meta = record?.meta as ChallengeMeta | undefined
  if (!record || !meta?.steps.length) {
    jar.delete(CHALLENGE_COOKIE)
    return expired
  }
  if (record.attempts >= MAX_CHALLENGE_TRIES) {
    await record.deleteOne()
    jar.delete(CHALLENGE_COOKIE)
    return { ok: false, error: "Too many wrong codes. Please sign in again." }
  }

  const user = await User.findById(record.userId).select("+totpSecretEncrypted +totpLastUsedStep +backupCodeHashes").lean()
  if (!user || user.status !== "active") return expired

  const step = meta.steps[0]
  const code = rawCode.trim()
  let passed = false

  if (step === "totp" && user.totpSecretEncrypted) {
    const matchedStep = verifyTotp(decryptString(user.totpSecretEncrypted), code, user.totpLastUsedStep)
    if (matchedStep !== null) {
      // Remember the step, so this exact code can't be replayed within its 30 seconds.
      await User.updateOne({ _id: user._id }, { $set: { totpLastUsedStep: matchedStep } })
      passed = true
    } else {
      // A backup code instead (lost phone). Each works once: it's removed when used.
      const hash = sha256(normalizeBackupCode(code))
      const used = await User.updateOne({ _id: user._id, backupCodeHashes: hash }, { $pull: { backupCodeHashes: hash } })
      if (used.modifiedCount === 1) {
        passed = true
        await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "security", action: "auth.backup_code_used", severity: "warning", summary: `${user.name} signed in with a backup code` })
      }
    }
  } else if (step === "email" && record.codeHash) {
    passed = /^\d{6}$/.test(code) && safeEqual(sha256(code), record.codeHash)
  }

  if (!passed) {
    record.attempts += 1
    await record.save()
    await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role }, category: "auth", action: "auth.challenge_failed", severity: "warning", summary: `Wrong ${step === "totp" ? "authenticator" : "emailed"} code for ${user.name}` })
    return { ok: false, error: `That code isn't right. ${MAX_CHALLENGE_TRIES - record.attempts} tries left.` }
  }

  const remaining = meta.steps.slice(1)
  if (remaining.length > 0) {
    record.meta = { ...meta, steps: remaining }
    record.markModified("meta")
    await record.save()
    return { ok: "challenge", redirectTo: "/host/login/verify" }
  }

  await record.deleteOne()
  jar.delete(CHALLENGE_COOKIE)
  return finishChallenge(user, meta)
}

/** All checks passed: start the admin session, remember the device, alert on unusual sign-ins. */
async function finishChallenge(user: IUser, meta: ChallengeMeta): Promise<SignInResult> {
  const sessionId = await createSession(user, meta.info, meta.deviceHash)
  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() }, $addToSet: { knownDevices: meta.deviceHash, ...(meta.info.country ? { knownCountries: meta.info.country } : {}) } },
  )

  await logAction({
    actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role, sessionId },
    category: "auth",
    action: "auth.login",
    severity: meta.risky ? "warning" : "info",
    summary: `${user.name} signed in with ${meta.method}${meta.risky ? ` from a ${meta.reasons.join(" and ")}` : ""}`,
    details: { place: describePlace(meta.info), device: describeDevice(meta.info.userAgent) },
  })

  // Unusual admin sign-ins: tell the super admin and the account owner.
  if (meta.risky) {
    const supers = await User.find({ role: "super_admin", status: "active" }).select("email").lean()
    const to = [...new Set([user.email, ...supers.map((s) => s.email)])]
    await sendQuietly("new sign-in alert", () =>
      sendNewSignInAlert(to, { name: user.name, email: user.email, place: describePlace(meta.info), device: describeDevice(meta.info.userAgent), at: new Date() }),
    )
  }

  return { ok: true, redirectTo: landingFor(toCurrentUser(user), meta.next) }
}

/**
 * API sign-in (POST /api/auth/login, for Postman): admins only, and the authenticator code is
 * required in the same request because an API client can't follow the emailed-code step.
 */
export async function signInForApi(rawEmail: string, password: string, code: string | undefined): Promise<"ok" | "invalid" | "locked" | "code_required"> {
  const email = rawEmail.trim().toLowerCase()
  const ipKey = `login:${await clientIp()}`
  if (!(await consumeAttempt(ipKey, LIMITS.login, { failClosed: true })) || !(await consumeAttempt(`login-account:${email}`, LIMITS.loginAccount, { failClosed: true }))) return "locked"

  await connectDB()
  const user = await User.findOne({ email }).select("+passwordHash +totpSecretEncrypted +totpLastUsedStep").lean()
  const valid = await verifyPassword(password, user?.passwordHash)
  if (!user || !valid || user.status !== "active" || !isAdminRole(user.role)) return "invalid"
  if (!user.totpSecretEncrypted || !user.totpEnabledAt) return "code_required"
  if (!code) return "code_required"
  const step = verifyTotp(decryptString(user.totpSecretEncrypted), code, user.totpLastUsedStep)
  if (step === null) return "invalid"

  await User.updateOne({ _id: user._id }, { $set: { totpLastUsedStep: step, lastLoginAt: new Date() } })
  const info = await getRequestInfo()
  const sessionId = await createSession(user, info, await deviceHashFromCookie(false))
  await clearAttempts(ipKey)
  await logAction({ actor: { id: user._id.toString(), email: user.email, name: user.name, role: user.role, sessionId }, category: "auth", action: "auth.login", summary: `${user.name} signed in through the API` })
  return "ok"
}

// ---------------------------------------------------------------- publish PIN

/** In production ADMIN_PUBLISH_PIN must be set; the 1234 default is for local development only. */
function getPublishPin(): string | undefined {
  const pin = process.env.ADMIN_PUBLISH_PIN?.trim()
  if (pin) return pin
  return process.env.NODE_ENV === "production" ? undefined : "1234"
}

/** The final permission to publish. Five wrong PINs lock publishing for 15 minutes. */
export async function verifyPublishPin(pin: string): Promise<"ok" | "wrong" | "locked" | "unconfigured"> {
  const expected = getPublishPin()
  if (!expected) {
    console.error("Publishing is disabled: set ADMIN_PUBLISH_PIN (required in production).")
    return "unconfigured"
  }

  const attemptKey = "publish-pin"
  if (!(await consumeAttempt(attemptKey, LIMITS.publishPin, { failClosed: true }))) return "locked"
  if (!safeEqual(pin.trim(), expected)) return "wrong"

  await clearAttempts(attemptKey)
  return "ok"
}
