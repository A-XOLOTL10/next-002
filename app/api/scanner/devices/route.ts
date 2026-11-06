import type { NextRequest } from "next/server"
import { listDevices } from "@/lib/scanner"
import { scannerJson, withDevice } from "@/lib/scanner-api"

/** GET /api/scanner/devices?eventId=... (admin phones only): the staff phones for an event. */
export async function GET(req: NextRequest) {
  return withDevice(
    req,
    async (ctx) => scannerJson({ devices: await listDevices(ctx.actor, { eventId: req.nextUrl.searchParams.get("eventId") ?? undefined, kind: "staff" }) }),
    { adminOnly: true },
  )
}
