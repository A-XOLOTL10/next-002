import "server-only"
import { headers } from "next/headers"
import connectDB from "@/lib/mongodb"
import RateLimit from "@/database/rate-limit.model"
import { isDuplicateKeyError } from "@/database/event.model"

// Attempt counters stored in MongoDB, so limits hold across restarts and server instances.

const MINUTE = 60 * 1000

/** How many attempts each action gets in its window. */
export const LIMITS = {
  login: { attempts: 5, windowMs: 15 * MINUTE }, // guessing the admin password
  publishPin: { attempts: 5, windowMs: 15 * MINUTE }, // guessing the publish PIN
  bookingPerIp: { attempts: 20, windowMs: 60 * MINUTE }, // bots filling in the booking form
  bookingEmail: { attempts: 3, windowMs: 60 * MINUTE }, // flooding someone's inbox with links
  aiImport: { attempts: 10, windowMs: 60 * MINUTE }, // runaway AI costs
} as const

/** Counts one attempt. Returns false once `key` has used up its attempts for this window. */
export async function consumeAttempt(key: string, { attempts, windowMs }: { attempts: number; windowMs: number }): Promise<boolean> {
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
    // If the limiter's own storage is down, don't lock everyone out of the site.
    console.error("Rate limit check failed:", e)
    return true
  }
}

/**
 * True once `key` has used up its attempts. Read-only, so an action can count only its
 * failures: a correct password or PIN should never use up an attempt.
 */
export async function isLockedOut(key: string, { attempts }: { attempts: number }): Promise<boolean> {
  try {
    await connectDB()
    const record = await RateLimit.findOne({ key, expiresAt: { $gt: new Date() } }).lean()
    return (record?.count ?? 0) >= attempts
  } catch (e) {
    console.error("Rate limit check failed:", e)
    return false
  }
}

/** Best guess at the visitor's address, for per-visitor limits. */
export async function clientIp(): Promise<string> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
}
