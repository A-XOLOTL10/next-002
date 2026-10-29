import "server-only"
import nodemailer, { type Transporter } from "nodemailer"
import { formatEventDate } from "@/lib/utils"

export type BookingEmailDetails = {
  to: string
  ticketId: string
  event: {
    title: string
    slug: string
    date: string // YYYY-MM-DD
    time: string // HH:mm
    venue: string
    location: string
  }
}

// One transporter per server process (reused across hot reloads, like the DB connection).
declare global {
  var mailTransporter: Transporter | undefined
}

/**
 * SMTP settings come from the environment (any provider: Gmail app password,
 * Outlook, Brevo, Mailtrap...). Returns null when unconfigured, so bookings
 * still work in development without email set up.
 */
function getTransporter(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null

  const port = Number(SMTP_PORT ?? 587)
  globalThis.mailTransporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return globalThis.mailTransporter
}

// Event fields are entered by admins; escape them so they can't inject HTML into the email.
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)

/**
 * Step 1 of booking: asks the visitor to confirm their email address. Without SMTP
 * configured, the link is printed to the server console so bookings can still be
 * tested locally.
 */
export async function sendBookingVerification({
  to,
  confirmUrl,
  event,
}: {
  to: string
  confirmUrl: string
  event: BookingEmailDetails["event"]
}): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn(`SMTP is not configured. Confirmation link for ${to} (${event.title}):\n  ${confirmUrl}`)
    return
  }

  const date = formatEventDate(event.date)

  const text = [
    `Please confirm your booking for ${event.title} (${date}, ${event.time}).`,
    "",
    `Confirm here: ${confirmUrl}`,
    "",
    "This link expires in 24 hours. If you didn't request this booking, ignore this email and nothing will happen.",
  ].join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h1 style="font-size:22px">Confirm your booking</h1>
      <p style="font-size:16px">You asked to book <strong>${escapeHtml(event.title)}</strong> on ${escapeHtml(date)} at ${escapeHtml(event.time)}.</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(confirmUrl)}" style="background:#59deca;color:#000;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Confirm my booking</a>
      </p>
      <p style="font-size:13px;color:#555">This link expires in 24 hours. Once confirmed, we'll email your ticket ID.</p>
      <p style="font-size:13px;color:#555">If you didn't request this booking, ignore this email and nothing will happen.</p>
    </div>`

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to,
    subject: `Confirm your booking for ${event.title}`,
    text,
    html,
  })
}

/** Step 2: the ticket, sent once the visitor confirms. Throws on send failure; callers decide whether that matters. */
export async function sendBookingConfirmation({ to, ticketId, event }: BookingEmailDetails): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn(`SMTP is not configured; skipped confirmation email for ticket ${ticketId}.`)
    return
  }

  const date = formatEventDate(event.date)
  const where = `${event.venue}, ${event.location}`
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
  const eventUrl = baseUrl ? `${baseUrl}/events/${event.slug}` : null

  // Plain-text version for clients that don't render HTML (and better spam scores).
  const text = [
    `You're booked for ${event.title}!`,
    "",
    `Ticket ID: ${ticketId}`,
    `Date: ${date}`,
    `Time: ${event.time}`,
    `Where: ${where}`,
    ...(eventUrl ? ["", `Event details: ${eventUrl}`] : []),
    "",
    "Keep this email: you may be asked for your ticket ID at the event.",
  ].join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h1 style="font-size:22px">You're booked for ${escapeHtml(event.title)}!</h1>
      <p style="font-size:16px;margin:16px 0">Your ticket ID:</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:2px;background:#f2f2f2;padding:12px;text-align:center">${escapeHtml(ticketId)}</p>
      <table style="font-size:15px;margin:16px 0;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#555">Date</td><td>${escapeHtml(date)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Time</td><td>${escapeHtml(event.time)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555">Where</td><td>${escapeHtml(where)}</td></tr>
      </table>
      ${eventUrl ? `<p><a href="${escapeHtml(eventUrl)}">View event details</a></p>` : ""}
      <p style="font-size:13px;color:#555">Keep this email: you may be asked for your ticket ID at the event.</p>
    </div>`

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to,
    subject: `Your ticket for ${event.title} (${ticketId})`,
    text,
    html,
  })
}
