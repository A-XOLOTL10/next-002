import type { NextRequest } from "next/server"
import { lookupTicket } from "@/lib/scanner"
import { readBody, scannerJson, text, withDevice } from "@/lib/scanner-api"

/**
 * POST /api/scanner/lookup: what a scanned QR code or typed ticket ID is (VIP or regular, valid,
 * used, wrong event). Changes nothing. Body: { "eventId", "code" }.
 */
export async function POST(req: NextRequest) {
  return withDevice(req, async (ctx) => {
    const body = await readBody(req)
    if (!body) return scannerJson({ message: "Send JSON with eventId and code." }, 400)
    return scannerJson(await lookupTicket(ctx, text(body, "eventId", 30), text(body, "code", 300)))
  })
}
