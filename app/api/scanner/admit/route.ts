import type { NextRequest } from "next/server"
import { admitTicket } from "@/lib/scanner"
import { readBody, scannerJson, text, withDevice } from "@/lib/scanner-api"

/** POST /api/scanner/admit: lets a ticket in (once, ever). Body: { "eventId", "code" }. */
export async function POST(req: NextRequest) {
  return withDevice(req, async (ctx) => {
    const body = await readBody(req)
    if (!body) return scannerJson({ message: "Send JSON with eventId and code." }, 400)
    return scannerJson(await admitTicket(ctx, text(body, "eventId", 30), text(body, "code", 300)))
  })
}
