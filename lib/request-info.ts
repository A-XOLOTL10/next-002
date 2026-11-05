import "server-only"
import { headers } from "next/headers"
import { clientIp } from "@/lib/rate-limit"

export type RequestInfo = {
  ip: string
  country?: string // ISO code, e.g. "NG"
  city?: string
  userAgent?: string
}

/**
 * Where a request comes from. On Vercel, the x-vercel-ip-* headers are set by Vercel itself
 * (a browser can't fake them). Locally and in other hosts they're absent, so country/city are
 * undefined, which the sign-in checks treat as "unknown", never as suspicious on its own.
 */
export async function getRequestInfo(): Promise<RequestInfo> {
  const h = await headers()
  const decode = (value: string | null) => {
    if (!value) return undefined
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return {
    ip: await clientIp(),
    country: h.get("x-vercel-ip-country") ?? undefined,
    city: decode(h.get("x-vercel-ip-city")),
    userAgent: h.get("user-agent")?.slice(0, 400) ?? undefined,
  }
}

/** "Chrome on Windows" from a user agent string, for emails and the sessions list. */
export function describeDevice(userAgent?: string): string {
  if (!userAgent) return "Unknown device"
  const browser = /Edg\//.test(userAgent) ? "Edge" : /OPR\//.test(userAgent) ? "Opera" : /Chrome\//.test(userAgent) ? "Chrome"
    : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "A browser"
  const os = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS"
    : /Mac OS X/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : "an unknown system"
  return `${browser} on ${os}`
}

/** "Lagos, NG", or "an unknown location" when the host doesn't provide geolocation. */
export const describePlace = (info: { city?: string; country?: string }): string =>
  [info.city, info.country].filter(Boolean).join(", ") || "an unknown location"
