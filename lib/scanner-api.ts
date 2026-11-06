import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { authenticateDevice, type ScannerContext } from "@/lib/scanner"
import { clientIp } from "@/lib/rate-limit"

// Shared plumbing for the /api/scanner routes the mobile app calls. Every response is JSON with
// a readable "message" on failure, and is never cached (each answer is about one phone, now).

export const scannerJson = (body: unknown, status = 200): NextResponse =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })

/** The request's JSON body as an object, or null when it isn't one. */
export async function readBody(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const text = (body: Record<string, unknown>, key: string, max = 500): string => {
  const value = body[key]
  return typeof value === "string" ? value.slice(0, max) : ""
}

/**
 * Runs `handler` for a signed-in phone. 401 tells the app its access is gone (unlinked, expired,
 * or its admin lost access), and the app then forgets its token. `adminOnly` routes answer 403
 * to staff phones, which can only scan.
 */
export async function withDevice(
  req: NextRequest,
  handler: (ctx: ScannerContext) => Promise<NextResponse>,
  { adminOnly = false }: { adminOnly?: boolean } = {},
): Promise<NextResponse> {
  try {
    const ctx = await authenticateDevice(req.headers.get("authorization"), await clientIp())
    if (!ctx) return scannerJson({ message: "This phone isn't linked any more. Set it up again with a new code." }, 401)
    if (adminOnly && ctx.kind !== "admin") return scannerJson({ message: "Staff phones can only check tickets in." }, 403)
    return await handler(ctx)
  } catch (e) {
    console.error(`Scanner API failed (${req.nextUrl.pathname}):`, e)
    return scannerJson({ message: "Something went wrong on the server. Try again." }, 500)
  }
}
