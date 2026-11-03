import "server-only"
import QRCode from "qrcode"

// A ticket's QR code holds a link to the check-in page for that ticket. Door staff scan it
// with any phone camera; the page needs an admin sign-in, so only staff can use it. The code
// is unique because the ticket ID is, across every event (see the Booking model).

const QR_OPTIONS = { errorCorrectionLevel: "M", margin: 2, width: 320 } as const

export const checkInUrl = (baseUrl: string, ticketId: string): string =>
  `${baseUrl}/admin/check-in?ticket=${encodeURIComponent(ticketId)}`

/** PNG bytes, attached inline to the ticket email. */
export const ticketQrPng = (url: string): Promise<Buffer> => QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png" })

/** Data URL, for showing the code on screen. */
export const ticketQrDataUrl = (url: string): Promise<string> => QRCode.toDataURL(url, QR_OPTIONS)
