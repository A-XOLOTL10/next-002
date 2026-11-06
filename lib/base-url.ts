import "server-only"
import { headers } from "next/headers"
import { siteUrl } from "@/lib/site-url"

/**
 * In production, links in emails and QR codes come only from the configured site address
 * (NEXT_PUBLIC_BASE_URL, see lib/site-url.ts). The request's Host header can be faked, which
 * would email someone a real booking link pointing at another site.
 */
export const baseUrlIsConfigured = (): boolean =>
  Boolean(siteUrl()) || process.env.NODE_ENV !== "production"

/** Absolute URL for links in emails and QR codes: the site address, else (development only) this request's host. */
export async function getBaseUrl(): Promise<string> {
  const configured = siteUrl()
  if (configured) return configured
  if (!baseUrlIsConfigured()) throw new Error("NEXT_PUBLIC_BASE_URL must be set in production")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}
