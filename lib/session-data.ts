import "server-only"
import connectDB from "@/lib/mongodb"
import Session from "@/database/session.model"
import { describeDevice, describePlace } from "@/lib/request-info"

export type SessionRow = { id: string; device: string; place: string; ip: string; createdAt: string; lastSeenAt: string; current: boolean }

/** The account's signed-in browsers, newest activity first, for "Where you're signed in". */
export async function getMySessions(userId: string, currentSessionId: string): Promise<SessionRow[]> {
  await connectDB()
  const sessions = await Session.find({ userId, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 }).limit(20).lean()
  return sessions.map((s) => ({
    id: s._id.toString(),
    device: describeDevice(s.userAgent),
    place: describePlace(s),
    ip: s.ip,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    current: s._id.toString() === currentSessionId,
  }))
}
