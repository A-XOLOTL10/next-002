import "server-only"
import { createHash } from "node:crypto"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/database/user.constants"

/**
 * Asks Have I Been Pwned whether this password appears in known data breaches. Only the first
 * 5 characters of its SHA-1 hash leave the server (k-anonymity), so the password itself, and
 * even its full hash, are never sent. If the service is down we don't block sign-up.
 */
async function isBreached(password: string): Promise<boolean> {
  const hash = createHash("sha1").update(password).digest("hex").toUpperCase()
  const prefix = hash.slice(0, 5)
  const suffix = hash.slice(5)
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" }, // hides even the size of the answer
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    })
    if (!res.ok) return false
    const body = await res.text()
    return body.split("\n").some((line) => {
      const [candidate, count] = line.trim().split(":")
      return candidate === suffix && Number(count) > 0
    })
  } catch {
    return false
  }
}

/** Returns a message saying what's wrong with the password, or null when it's acceptable. */
export async function checkNewPassword(password: string, { email, name }: { email?: string; name?: string } = {}): Promise<string | null> {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters. A short phrase is easiest to remember.`
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`
  const lower = password.toLowerCase()
  const emailName = email?.split("@")[0]?.toLowerCase()
  if (emailName && emailName.length >= 4 && lower.includes(emailName)) return "Don't include your email address in your password."
  if (name && name.trim().length >= 4 && lower.includes(name.trim().toLowerCase())) return "Don't include your name in your password."
  if (/^(.)\1+$/.test(password)) return "Don't repeat one character."
  if (await isBreached(password)) return "This password has appeared in a data breach, so attackers try it first. Please choose another."
  return null
}
