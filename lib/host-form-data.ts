import "server-only"
import connectDB from "@/lib/mongodb"
import HostProfile from "@/database/host-profile.model"
import { aiImagesConfigured } from "@/lib/ai-images"

/** What the host event form needs besides the event: sponsor choices, AI availability, default contact. */
export async function getHostFormContext(userId: string, fallback: { name: string; email: string }) {
  await connectDB()
  const profile = await HostProfile.findOne({ userId }).select("status organizations contactName contactPhone contactEmail").lean()
  return {
    approved: profile?.status === "approved",
    // Denied organizations can't back an event.
    sponsors: (profile?.organizations ?? []).filter((o) => o.status !== "denied").map((o) => ({ id: o._id.toString(), name: o.name, status: o.status })),
    aiEnabled: aiImagesConfigured(),
    defaultContact: { name: profile?.contactName || fallback.name, phone: profile?.contactPhone ?? "", email: profile?.contactEmail || fallback.email },
  }
}
