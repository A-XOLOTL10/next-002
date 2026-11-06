import type { NextRequest } from "next/server"
import { redeemSetupCode } from "@/lib/scanner"
import { readBody, scannerJson, text } from "@/lib/scanner-api"
import { clientIp } from "@/lib/rate-limit"

/**
 * POST /api/scanner/setup: the app scanned an admin link code or a staff pass.
 * Body: { "code": "DEVEVENT-LINK:..." | "DEVEVENT-STAFF:...", "installId", "deviceName", "platform" }
 * Returns { token, device }. The token is shown only here; the app keeps it in secure storage.
 */
export async function POST(req: NextRequest) {
  const body = await readBody(req)
  if (!body) return scannerJson({ message: "Send JSON with code, installId, deviceName and platform." }, 400)
  try {
    const result = await redeemSetupCode(
      text(body, "code", 200),
      { installId: text(body, "installId", 120), deviceName: text(body, "deviceName", 120), platform: text(body, "platform", 40) },
      await clientIp(),
    )
    if (!result.ok) return scannerJson({ message: result.message }, result.status)
    return scannerJson({ token: result.token, device: result.device })
  } catch (e) {
    console.error("Scanner setup failed:", e)
    return scannerJson({ message: "Something went wrong on the server. Try again." }, 500)
  }
}
