import "server-only"
import nodemailer, { type Transporter } from "nodemailer"
import { formatEventDate } from "@/lib/utils"

export type EmailEvent = {
  title: string
  slug: string
  date: string // YYYY-MM-DD
  time: string // HH:mm
  timezone: string
  venue: string
  location: string
}

// One transporter per server process (reused across hot reloads, like the DB connection).
declare global {
  var mailTransporter: Transporter | undefined
}

/** A value left as a template placeholder (e.g. "<Gmail app password>") counts as unset. */
const isSet = (value: string | undefined): value is string => Boolean(value?.trim()) && !/[<>]/.test(value ?? "")

/** True when all the SMTP settings are filled in. Without them, no email can be sent. */
export function emailIsConfigured(): boolean {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env
  return isSet(SMTP_HOST) && isSet(SMTP_USER) && isSet(SMTP_PASS)
}

function getTransporter(): Transporter {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  const port = Number(SMTP_PORT ?? 587)

  globalThis.mailTransporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Fail in seconds rather than leaving the visitor waiting on a dead mail server.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return globalThis.mailTransporter
}

// Event fields come from admins and imported forms; escape them so they can't inject HTML.
const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)

const sender = (): string | undefined => (isSet(process.env.EMAIL_FROM) ? process.env.EMAIL_FROM : process.env.SMTP_USER)

/** "Saturday, 28 November 2026 at 17:00 (Africa/Lagos)" */
const describeWhen = (event: EmailEvent): string => `${formatEventDate(event.date)} at ${event.time} (${event.timezone})`

/** Step 1 of booking: proves the visitor owns the address. Throws if the email can't be sent. */
export async function sendBookingVerification({
  to,
  confirmUrl,
  event,
}: {
  to: string
  confirmUrl: string
  event: EmailEvent
}): Promise<void> {
  const when = describeWhen(event)

  const text = [
    `Please confirm your booking for ${event.title}.`,
    `When: ${when}`,
    "",
    `Confirm here: ${confirmUrl}`,
    "",
    "This link expires in 24 hours. If you didn't request this booking, ignore this email and nothing will happen.",
  ].join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h1 style="font-size:22px">Confirm your booking</h1>
      <p style="font-size:16px">You asked to book <strong>${escapeHtml(event.title)}</strong>.</p>
      <p style="font-size:15px;color:#333">${escapeHtml(when)}</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(confirmUrl)}" style="background:#59deca;color:#000;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Confirm my booking</a>
      </p>
      <p style="font-size:13px;color:#555">This link expires in 24 hours. Once confirmed, we'll email your ticket and QR code.</p>
      <p style="font-size:13px;color:#555">If you didn't request this booking, ignore this email and nothing will happen.</p>
    </div>`

  await getTransporter().sendMail({ from: sender(), to, subject: `Confirm your booking for ${event.title}`, text, html })
}

/** Step 2: the ticket, with its QR code for the door. Throws if the email can't be sent. */
export async function sendBookingConfirmation({
  to,
  ticketId,
  qrPng,
  event,
}: {
  to: string
  ticketId: string
  qrPng: Buffer
  event: EmailEvent
}): Promise<void> {
  const when = describeWhen(event)
  const where = `${event.venue}, ${event.location}`
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "")
  const eventUrl = baseUrl ? `${baseUrl}/events/${event.slug}` : null

  // Plain-text version for clients that don't render HTML (and better spam scores).
  const text = [
    `You're booked for ${event.title}!`,
    "",
    `Ticket ID: ${ticketId}`,
    `When: ${when}`,
    `Where: ${where}`,
    ...(eventUrl ? ["", `Event details: ${eventUrl}`] : []),
    "",
    "Show the QR code in this email at the entrance. Each ticket can only be scanned once.",
  ].join("\n")

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h1 style="font-size:22px">You're booked for ${escapeHtml(event.title)}!</h1>
      <p style="text-align:center;margin:20px 0 8px">
        <img src="cid:ticket-qr" alt="Your ticket QR code" width="240" height="240" />
      </p>
      <p style="font-size:22px;font-weight:bold;letter-spacing:2px;text-align:center;margin:0 0 20px">${escapeHtml(ticketId)}</p>
      <table style="font-size:15px;margin:16px 0;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">When</td><td>${escapeHtml(when)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#555;vertical-align:top">Where</td><td>${escapeHtml(where)}</td></tr>
      </table>
      ${eventUrl ? `<p><a href="${escapeHtml(eventUrl)}">View event details</a></p>` : ""}
      <p style="font-size:13px;color:#555">Show this QR code at the entrance. Each ticket can only be scanned once, so don't share it.</p>
    </div>`

  await getTransporter().sendMail({
    from: sender(),
    to,
    subject: `Your ticket for ${event.title} (${ticketId})`,
    text,
    html,
    // Inline attachment: Gmail and Outlook block data: URLs in images, but show cid: ones.
    attachments: [{ filename: `${ticketId}.png`, content: qrPng, contentType: "image/png", cid: "ticket-qr" }],
  })
}
