import type { NextRequest } from "next/server"
import { scannerEvents, unlinkSelf } from "@/lib/scanner"
import { scannerJson, withDevice } from "@/lib/scanner-api"

/** GET /api/scanner/me: who this phone is, and the events it can check in (with live counts). */
export async function GET(req: NextRequest) {
  return withDevice(req, async (ctx) => scannerJson({ device: ctx.summary, events: await scannerEvents(ctx) }))
}

/** DELETE /api/scanner/me: the phone unlinks itself. */
export async function DELETE(req: NextRequest) {
  return withDevice(req, async (ctx) => {
    await unlinkSelf(ctx)
    return scannerJson({ message: "Unlinked." })
  })
}
