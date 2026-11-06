import type { NextRequest } from "next/server"
import { createStaffPass } from "@/lib/scanner"
import { readBody, scannerJson, text, withDevice } from "@/lib/scanner-api"

/**
 * POST /api/scanner/passes (admin phones only): a one-time staff pass QR code for one event.
 * Body: { "eventId", "label": "Gate A, Tunde", "hours": 0 | 4 | 8 | 12 } (0 = until the event ends).
 */
export async function POST(req: NextRequest) {
  return withDevice(
    req,
    async (ctx) => {
      const body = await readBody(req)
      if (!body) return scannerJson({ message: "Send JSON with eventId, label and hours." }, 400)
      const result = await createStaffPass(ctx.actor, { eventId: text(body, "eventId", 30), label: text(body, "label", 80), hours: Number(body.hours) })
      if (!result.ok) return scannerJson({ message: result.message }, 400)
      return scannerJson({ ...result.code, deviceExpiresAt: result.deviceExpiresAt, eventTitle: result.eventTitle })
    },
    { adminOnly: true },
  )
}
