import "server-only"
import { createHash, createHmac, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { ADMIN_SESSION_COOKIE } from "@/lib/session-cookies"
import { LIMITS, clearAttempts, clientIp, consumeAttempt } from "@/lib/rate-limit"

// Admin auth, kept deliberately simple: one admin account from environment variables,
// and a stateless session cookie of the form "<expiresAtMs>.<signature>". The signature
// is an HMAC of the expiry using ADMIN_SESSION_SECRET, so the cookie can't be forged or
// extended without the secret. Nothing is stored in the database.

const SESSION_COOKIE = ADMIN_SESSION_COOKIE
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000 // 8 hours

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32 || /[<>]/.test(secret)) {
    throw new Error("ADMIN_SESSION_SECRET must be a random value of at least 32 characters (not the placeholder text).")
  }
  return secret
}

const sign = (expiresAt: number): string =>
  createHmac("sha256", getSecret()).update(`admin:${expiresAt}`).digest("base64url")

/** Constant-time string comparison: hashing first makes both sides equal length. */
function safeEqual(a: string, b: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(hash(a), hash(b))
}

function getAdminCredentials(): { adminEmail: string; adminPassword: string } {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set.")
  }
  return { adminEmail, adminPassword }
}

/** True if the email/password match the admin credentials in the environment. */
function checkAdminCredentials(email: string, password: string): boolean {
  const { adminEmail, adminPassword } = getAdminCredentials()

  // Compare both, always, so timing doesn't reveal which one was wrong.
  const emailMatches = safeEqual(email.trim().toLowerCase(), adminEmail.trim().toLowerCase())
  const passwordMatches = safeEqual(password, adminPassword)
  return emailMatches && passwordMatches
}

export type SignInResult = "ok" | "invalid" | "locked" | "unconfigured"

/**
 * The whole admin sign-in, shared by the login form and POST /api/auth/login. Five wrong
 * attempts from one address lock it out for 15 minutes, which stops password guessing.
 * Must be called from a Server Action or Route Handler, because it sets a cookie.
 */
export async function signInAdmin(email: string, password: string): Promise<SignInResult> {
  try {
    // Checked first, so a setup problem is reported rather than counted as a failed sign-in.
    getSecret()
    getAdminCredentials()
  } catch (e) {
    // A setup problem, not the user's mistake. The server log says exactly which setting is wrong.
    console.error("Admin login isn't configured:", e instanceof Error ? e.message : e)
    return "unconfigured"
  }

  // Every attempt is counted before the password is checked; a correct one clears the count.
  const ipKey = `login:${await clientIp()}`
  const allKey = "login:all"
  if (!(await consumeAttempt(ipKey, LIMITS.login, { failClosed: true }))) return "locked"
  if (!(await consumeAttempt(allKey, LIMITS.loginAll, { failClosed: true }))) return "locked"

  if (!checkAdminCredentials(email, password)) return "invalid"

  await clearAttempts(ipKey, allKey)
  await createSession()
  return "ok"
}

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

/** Sets the session cookie. Only callable from a Server Action or Route Handler. */
export async function createSession(): Promise<void> {
  const expiresAt = Date.now() + SESSION_DURATION_MS
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, `${expiresAt}.${sign(expiresAt)}`, {
    httpOnly: true, // not readable from JavaScript
    secure: process.env.NODE_ENV === "production", // HTTPS-only in production
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  })
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

/** True if the request carries a valid, unexpired admin session. */
export async function isAdmin(): Promise<boolean> {
  // The expiry check reads the current time, which Next won't bake into a prerender
  // (with Partial Prefetching, cookies can be available while prerendering).
  // connection() makes this check always run at request time.
  await connection()

  const value = (await cookies()).get(SESSION_COOKIE)?.value
  if (!value) return false

  const [expiresAtRaw, signature] = value.split(".")
  const expiresAt = Number(expiresAtRaw)
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false

  try {
    return safeEqual(signature, sign(expiresAt))
  } catch {
    return false // without a usable secret, no session can be trusted
  }
}

/** Use at the top of every admin page and admin Server Action: redirects to login if not signed in. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login")
}
