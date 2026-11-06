import "server-only"
import QRCode from "qrcode"
import { getBaseUrl } from "@/lib/base-url"
import { emailIsConfigured, sendBookingConfirmation, type EmailEvent } from "@/lib/email"

// A ticket's QR code holds a short link to that ticket (/t/DEV-XXXXXXXXXX). Door staff scan it
// with any phone camera: signed-in admins, and the event's own host, land on the check-in page;
// anyone else just sees "show this at the entrance". The code is unique because the ticket ID
// is, across every event (see the Booking model).
//
// Tickets emailed before this change point to /admin/check-in?ticket=...; next.config.ts
// redirects those to the new address, so they still work at the door.

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 2, width: 320 } as const

export const checkInUrl = (baseUrl: string, ticketId: string): string => `${baseUrl}/t/${encodeURIComponent(ticketId)}`

/** PNG bytes, attached inline to the ticket email. */
export const ticketQrPng = (url: string): Promise<Buffer> => QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png" })

/** Data URL, for showing the code on screen. */
export const ticketQrDataUrl = (url: string): Promise<string> => QRCode.toDataURL(url, QR_OPTIONS)

/** Emails a ticket with its QR code (bookings and VIP invites). Returns whether it was actually sent. */
export async function emailTicket(to: string, ticketId: string, event: EmailEvent, vip?: "invited" | "upgraded"): Promise<boolean> {
  if (!emailIsConfigured()) {
    if (process.env.NODE_ENV !== "production") console.warn(`[email not configured] would send ${vip ? "VIP " : ""}ticket ${ticketId} to ${to}`)
    return false
  }
  try {
    const qrPng = await ticketQrPng(checkInUrl(await getBaseUrl(), ticketId))
    await sendBookingConfirmation({ to, ticketId, qrPng, event, vip })
    return true
  } catch (e) {
    console.error(`Ticket email failed for ${ticketId}:`, e)
    return false
  }
}
