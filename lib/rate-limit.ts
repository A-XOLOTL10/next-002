import "server-only"
import { headers } from "next/headers"
import connectDB from "@/lib/mongodb"
import RateLimit from "@/database/rate-limit.model"
import { isDuplicateKeyError } from "@/database/event.model"

// Attempt counters stored in MongoDB, so limits hold across restarts and server instances.

const MINUTE = 60 * 1000

/** How many attempts each action gets in its window. */
export const LIMITS = {
  login: { attempts: 5, windowMs: 15 * MINUTE }, // guessing a password from one address
  // One account from any address: stops guessing spread over many addresses.
  loginAccount: { attempts: 10, windowMs: 15 * MINUTE },
  // All addresses together: a hard cap even if an attacker keeps changing (or faking) their address.
  loginAll: { attempts: 200, windowMs: 15 * MINUTE },
  signup: { attempts: 5, windowMs: 60 * MINUTE }, // account creation per address
  emailLink: { attempts: 3, windowMs: 60 * MINUTE }, // verification / reset emails per address
  verification: { attempts: 5, windowMs: 60 * MINUTE }, // host verification submissions
  hostEvent: { attempts: 30, windowMs: 60 * MINUTE }, // host event saves
  aiImage: { attempts: 10, windowMs: 24 * 60 * MINUTE }, // AI images per host per day (paid per image)
  report: { attempts: 5, windowMs: 60 * MINUTE }, // "report this event" per address
  activity: { attempts: 120, windowMs: 60 * MINUTE }, // browser activity batches per admin
  publishPin: { attempts: 5, windowMs: 15 * MINUTE }, // guessing the publish PIN
  bookingPerIp: { attempts: 20, windowMs: 60 * MINUTE }, // bots filling in the booking form
  bookingEmail: { attempts: 3, windowMs: 60 * MINUTE }, // flooding someone's inbox with links
  aiImport: { attempts: 10, windowMs: 60 * MINUTE }, // runaway AI costs
  vipInvite: { attempts: 10, windowMs: 60 * MINUTE }, // VIP list submissions per account (no spamming via VIP lists)
  scannerScan: { attempts: 1500, windowMs: 60 * MINUTE }, // ticket look-ups per phone (a busy door, not ID guessing)
  scannerSetup: { attempts: 10, windowMs: 15 * MINUTE }, // scanning link codes / staff passes, per address
  staffPass: { attempts: 60, windowMs: 60 * MINUTE }, // staff passes issued per admin
  deviceLinkCode: { attempts: 5, windowMs: 15 * MINUTE }, // guessing the authenticator code to link a phone
} as const

/**
 * Counts one attempt. Returns false once `key` has used up its attempts for this window.
 * Call it *before* checking a password or PIN: the count is atomic, so parallel guesses
 * can't all slip under the limit. `failClosed` refuses when the counter can't be reached.
 */
export async function consumeAttempt(
  key: string,
  { attempts, windowMs }: { attempts: number; windowMs: number },
  { failClosed = false } = {},
): Promise<boolean> {
  const now = new Date()

  const increment = () =>
    RateLimit.findOneAndUpdate(
      { key },
      [
        {
          // An update pipeline, so "expired window? start again" and the increment are one atomic step.
          $set: {
            count: { $cond: [{ $gt: ["$expiresAt", now] }, { $add: ["$count", 1] }, 1] },
            expiresAt: { $cond: [{ $gt: ["$expiresAt", now] }, "$expiresAt", new Date(now.getTime() + windowMs)] },
          },
        },
      ],
      { upsert: true, returnDocument: "after", updatePipeline: true },
    ).lean()

  try {
    await connectDB()
    let record
    try {
      record = await increment()
    } catch (e) {
      // Two first attempts raced to create the record: the loser just increments it.
      if (e instanceof Error && isDuplicateKeyError(e)) record = await increment()
      else throw e
    }
    return (record?.count ?? 1) <= attempts
  } catch (e) {
    // If the limiter's own storage is down, public forms keep working; secrets stay guarded.
    console.error("Rate limit check failed:", e)
    return !failClosed
  }
}

/** Gives one attempt back, e.g. when an AI image failed through no fault of the user. */
export async function releaseAttempt(key: string): Promise<void> {
  try {
    await connectDB()
    await RateLimit.updateOne({ key, count: { $gt: 0 } }, { $inc: { count: -1 } })
  } catch (e) {
    console.error("Rate limit release failed:", e)
  }
}

/** Forgets `key`'s attempts, e.g. after a correct password, so they don't count against it. */
export async function clearAttempts(...keys: string[]): Promise<void> {
  try {
    await connectDB()
    await RateLimit.deleteMany({ key: { $in: keys } })
  } catch (e) {
    console.error("Rate limit reset failed:", e)
  }
}

/**
 * Best guess at the visitor's address, for per-visitor limits. Uses the *last* x-forwarded-for
 * entry: that's the one our own proxy added (Vercel replaces the header entirely), while earlier
 * entries are whatever the client sent. Without a proxy in front, every header here can be
 * faked, which is why login also has an overall limit (LIMITS.loginAll).
 */
export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || "unknown"
}
