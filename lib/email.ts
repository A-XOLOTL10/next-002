import "server-only"
import nodemailer, { type Transporter } from "nodemailer"
import type { SendMailOptions } from "nodemailer"
import { formatEventDate } from "@/lib/utils"
import { siteUrl as configuredSiteUrl } from "@/lib/site-url"

// Every email DevEvent sends, built on one branded layout (renderEmail below) so they all look
// alike and work in Gmail, Outlook and Apple Mail: table layout, inline styles, no web fonts,
// and a plain-text version of each. All values from users are escaped before going into HTML.

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

/**
 * A value left as a template placeholder (e.g. "<Gmail app password>") counts as unset.
 * "DevEvent <you@gmail.com>" is a real sender, not a placeholder: its brackets hold an address.
 */
const isSet = (value: string | undefined): value is string => Boolean(value?.trim()) && !/<[^@>]*>/.test(value ?? "")

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

// Event fields come from admins and hosts; escape them so they can't inject HTML.
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c)

const sender = (): string | undefined => (isSet(process.env.EMAIL_FROM) ? process.env.EMAIL_FROM : process.env.SMTP_USER)

const siteUrl = (): string => configuredSiteUrl()

/** "Saturday, 28 November 2026 at 17:00 (Africa/Lagos)" */
const describeWhen = (event: EmailEvent): string => `${formatEventDate(event.date)} at ${event.time} (${event.timezone})`

// ---------------------------------------------------------------- layout

type EmailContent = {
  /** Shown as the inbox preview line. */
  preview: string
  heading: string
  /** Plain sentences; each becomes a paragraph. Escaped. */
  paragraphs: string[]
  /** Label/value rows (e.g. When / Where). Escaped. */
  details?: [string, string][]
  button?: { label: string; url: string }
  /** Raw HTML placed under the heading (only for trusted, built-in content such as the QR image). */
  trustedHtml?: string
  /** Small print at the bottom. Escaped. */
  footnote?: string
}

/** The shared branded layout: dark header, white card, teal button. Returns HTML and plain text. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
  const p = (text: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#1f2933">${escapeHtml(text)}</p>`
  const details = content.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;font-size:14px;border-collapse:collapse">${content.details
        .map(([label, value]) => `<tr><td style="padding:4px 14px 4px 0;color:#6b7785;vertical-align:top;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:4px 0;color:#1f2933">${escapeHtml(value)}</td></tr>`)
        .join("")}</table>`
    : ""
  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr><td style="border-radius:6px;background:#59deca"><a href="${escapeHtml(content.button.url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:bold;color:#030708;text-decoration:none;border-radius:6px">${escapeHtml(content.button.label)}</a></td></tr></table>
       <p style="margin:0 0 16px;font-size:12px;color:#6b7785;word-break:break-all">Button not working? Copy this link: ${escapeHtml(content.button.url)}</p>`
    : ""
  const footnote = content.footnote ? `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#6b7785">${escapeHtml(content.footnote)}</p>` : ""
  const base = siteUrl()

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:#eef2f4">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(content.preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f4;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:Arial,Helvetica,sans-serif">
<tr><td style="background:#030708;padding:18px 24px;border-radius:10px 10px 0 0"><span style="font-size:18px;font-weight:bold;color:#59deca;letter-spacing:.5px">DevEvent</span></td></tr>
<tr><td style="background:#ffffff;padding:28px 24px;border-radius:0 0 10px 10px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#030708">${escapeHtml(content.heading)}</h1>
${content.trustedHtml ?? ""}${content.paragraphs.map(p).join("")}${details}${button}${footnote}
</td></tr>
<tr><td style="padding:16px 8px;text-align:center;font-size:12px;color:#6b7785">DevEvent: the hub for developer events${base ? ` &middot; <a href="${escapeHtml(base)}/privacy" style="color:#6b7785">Privacy</a> &middot; <a href="${escapeHtml(base)}/terms" style="color:#6b7785">Terms</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`

  const text = [
    content.heading,
    "",
    ...content.paragraphs,
    ...(content.details?.length ? ["", ...content.details.map(([label, value]) => `${label}: ${value}`)] : []),
    ...(content.button ? ["", `${content.button.label}: ${content.button.url}`] : []),
    ...(content.footnote ? ["", content.footnote] : []),
    "",
    "DevEvent",
  ].join("\n")

  return { html, text }
}

/** Sends one email built with renderEmail. Throws if it can't be sent (callers decide what that means). */
async function send(to: string | string[], subject: string, content: EmailContent, extra: { attachments?: SendMailOptions["attachments"]; bcc?: boolean } = {}): Promise<void> {
  const { html, text } = renderEmail(content)
  const recipients = Array.isArray(to) ? to : [to]
  await getTransporter().sendMail({
    from: sender(),
    // Several recipients go in Bcc, so nobody sees anyone else's address.
    ...(extra.bcc ? { to: sender(), bcc: recipients } : { to: recipients }),
    subject,
    text,
    html,
    attachments: extra.attachments,
  })
}

/**
 * For notifications that shouldn't fail the action that triggered them (status updates, alerts).
 * Without SMTP in development, prints the message so the flow can still be followed.
 */
export async function sendQuietly(label: string, task: () => Promise<void>): Promise<boolean> {
  if (!emailIsConfigured()) {
    if (process.env.NODE_ENV !== "production") console.warn(`[email not configured] would send: ${label}`)
    return false
  }
  try {
    await task()
    return true
  } catch (e) {
    console.error(`Email failed (${label}):`, e)
    return false
  }
}

// ---------------------------------------------------------------- bookings

/** Step 1 of booking: proves the visitor owns the address. Throws if the email can't be sent. */
export async function sendBookingVerification({ to, confirmUrl, event }: { to: string; confirmUrl: string; event: EmailEvent }): Promise<void> {
  await send(to, `Confirm your booking for ${event.title}`, {
    preview: `One click to confirm your spot at ${event.title}.`,
    heading: "Confirm your booking",
    paragraphs: [`You asked to book ${event.title}. Confirm it to get your ticket.`],
    details: [["When", describeWhen(event)], ["Where", `${event.venue}, ${event.location}`]],
    button: { label: "Confirm my booking", url: confirmUrl },
    footnote: "This link expires in 24 hours. If you didn't request this booking, ignore this email and nothing will happen.",
  })
}

/**
 * Step 2: the ticket, with its QR code for the door. Throws if the email can't be sent.
 * `vip`: the host put this address on the VIP list ("invited" when they never booked themselves).
 * A VIP ticket's QR code is the same as any other; the door scanner looks the tier up.
 */
export async function sendBookingConfirmation({ to, ticketId, qrPng, event, vip }: { to: string; ticketId: string; qrPng: Buffer; event: EmailEvent; vip?: "invited" | "upgraded" }): Promise<void> {
  const base = siteUrl()
  await send(
    to,
    vip ? `Your VIP ticket for ${event.title} (${ticketId})` : `Your ticket for ${event.title} (${ticketId})`,
    {
      preview: vip ? `You're on the VIP list for ${event.title}. Ticket ${ticketId}.` : `Your ticket ${ticketId} for ${event.title}.`,
      heading:
        vip === "invited" ? `You're invited to ${event.title} as a VIP`
        : vip === "upgraded" ? `You're now a VIP at ${event.title}`
        : `You're booked for ${event.title}!`,
      // Inline (cid:) image: Gmail and Outlook block data: URLs in images, but show cid: ones.
      trustedHtml: `<p style="text-align:center;margin:8px 0"><img src="cid:ticket-qr" alt="Your ticket QR code" width="220" height="220" style="display:inline-block"></p>
        <p style="text-align:center;margin:0 0 20px;font-size:22px;font-weight:bold;letter-spacing:2px;color:#030708">${escapeHtml(ticketId)}</p>`,
      paragraphs: [
        ...(vip === "invited" ? ["The organizer has added you to the VIP list, so there's nothing to book: this is your ticket."] : []),
        ...(vip === "upgraded" ? ["The organizer has added you to the VIP list. Your ticket is the same one you already have; it now shows as VIP at the door."] : []),
        "Show this QR code at the entrance. Each ticket can only be scanned once, so don't share it.",
      ],
      details: [["When", describeWhen(event)], ["Where", `${event.venue}, ${event.location}`], ...(vip ? [["Ticket", "VIP"] as [string, string]] : [])],
      button: base ? { label: "View event details", url: `${base}/events/${event.slug}` } : undefined,
    },
    { attachments: [{ filename: `${ticketId}.png`, content: qrPng, contentType: "image/png", cid: "ticket-qr" }] },
  )
}

/** To everyone booked on an event that changed (after an admin approved the change) or was cancelled. */
export async function sendAttendeeUpdate(
  recipients: string[],
  { event, kind, changes, reason }: { event: EmailEvent; kind: "changed" | "cancelled"; changes?: [string, string][]; reason?: string },
): Promise<void> {
  // Gmail allows ~100 recipients per message: send in batches, always as Bcc.
  for (let i = 0; i < recipients.length; i += 50) {
    const batch = recipients.slice(i, i + 50)
    if (kind === "cancelled") {
      await send(batch, `Cancelled: ${event.title}`, {
        preview: `${event.title} has been cancelled.`,
        heading: `${event.title} has been cancelled`,
        paragraphs: [
          "We're sorry: the host has cancelled this event, so your ticket is no longer valid.",
          ...(reason ? [`Reason given: ${reason}`] : []),
        ],
        details: [["Was planned for", describeWhen(event)]],
        button: siteUrl() ? { label: "Find another event", url: `${siteUrl()}/events` } : undefined,
      }, { bcc: true })
    } else {
      await send(batch, `Updated details: ${event.title}`, {
        preview: `Some details of ${event.title} have changed.`,
        heading: `${event.title} has been updated`,
        paragraphs: ["Some details of an event you booked have changed. Your ticket is still valid."],
        details: changes,
        button: siteUrl() ? { label: "See the event", url: `${siteUrl()}/events/${event.slug}` } : undefined,
      }, { bcc: true })
    }
  }
}

// ---------------------------------------------------------------- accounts

export async function sendEmailVerification(to: string, name: string, url: string): Promise<void> {
  await send(to, "Confirm your email for DevEvent", {
    preview: "Confirm your email to finish creating your host account.",
    heading: `Welcome, ${name}`,
    paragraphs: ["Confirm your email address to finish creating your DevEvent host account."],
    button: { label: "Confirm my email", url },
    footnote: "This link expires in 24 hours. If you didn't sign up, ignore this email.",
  })
}

/** Someone tried to sign up with an address that already has an account. */
export async function sendSignupExistingAccount(to: string, loginUrl: string, resetUrl: string): Promise<void> {
  await send(to, "You already have a DevEvent account", {
    preview: "Someone tried to create an account with this email.",
    heading: "You already have an account",
    paragraphs: ["Someone (hopefully you) tried to create a DevEvent account with this email. You already have one, so just sign in."],
    button: { label: "Sign in", url: loginUrl },
    footnote: `Forgot your password? Reset it here: ${resetUrl}. If this wasn't you, you can ignore this email.`,
  })
}

export async function sendPasswordReset(to: string, name: string, url: string): Promise<void> {
  await send(to, "Reset your DevEvent password", {
    preview: "Use this link to choose a new password.",
    heading: "Reset your password",
    paragraphs: [`Hi ${name}, use the button below to choose a new password. Every device signed in to your account will be signed out.`],
    button: { label: "Choose a new password", url },
    footnote: "This link expires in 1 hour and works once. If you didn't ask for this, ignore this email; your password won't change.",
  })
}

export async function sendLoginCode(to: string, { name, code, place, device }: { name: string; code: string; place: string; device: string }): Promise<void> {
  await send(to, `${code} is your DevEvent sign-in code`, {
    preview: `Your sign-in code is ${code}.`,
    heading: "Confirm it's you",
    paragraphs: [`Hi ${name}, we noticed a sign-in from a device or place we haven't seen before. Enter this code to continue:`],
    trustedHtml: `<p style="margin:4px 0 18px;font-size:30px;font-weight:bold;letter-spacing:6px;color:#030708">${escapeHtml(code)}</p>`,
    details: [["Device", device], ["Location", place]],
    footnote: "The code expires in 10 minutes. If this wasn't you, don't share the code, and change your password straight away.",
  })
}

/** To the super admin (and the account owner) after an admin signs in from somewhere new. */
export async function sendNewSignInAlert(to: string[], { name, email, place, device, at }: { name: string; email: string; place: string; device: string; at: Date }): Promise<void> {
  await send(to, `New admin sign-in: ${name}`, {
    preview: `${name} signed in from ${place}.`,
    heading: "New sign-in to an admin account",
    paragraphs: [`${name} (${email}) signed in from a device or location not seen before. It passed the extra checks.`],
    details: [["When", at.toUTCString()], ["Device", device], ["Location", place]],
    button: siteUrl() ? { label: "Review active sessions", url: `${siteUrl()}/host/console/security` } : undefined,
    footnote: "If this wasn't expected, suspend the account from the Team page and sign it out everywhere.",
  }, { bcc: true })
}

/** To the admin (and the super admin) when a phone is linked to an admin account in the scanner app. */
export async function sendDeviceLinkedAlert(to: string[], { name, email, device, place, at }: { name: string; email: string; device: string; place: string; at: Date }): Promise<void> {
  await send(to, `Phone linked to ${name}'s admin account`, {
    preview: `${device} can now check tickets in as ${name}.`,
    heading: "A phone was linked to an admin account",
    paragraphs: [`${name} (${email}) linked a phone to the DevEvent Scanner app. It can check tickets in and hand out staff passes until it's unlinked or 30 days pass.`],
    details: [["When", at.toUTCString()], ["Phone", device], ["Location", place]],
    button: siteUrl() ? { label: "See linked phones", url: `${siteUrl()}/host/console/devices` } : undefined,
    footnote: "If this wasn't expected, unlink the phone from the Mobile app page straight away.",
  }, { bcc: true })
}

export async function sendAdminInvite(to: string, { name, inviterName, url }: { name: string; inviterName: string; url: string }): Promise<void> {
  await send(to, "You've been invited to manage DevEvent", {
    preview: `${inviterName} invited you to the DevEvent team.`,
    heading: `Hi ${name}, you're invited`,
    paragraphs: [
      `${inviterName} has added you to the DevEvent team. Set your password to get started.`,
      "After signing in you'll set up an authenticator app (such as Google Authenticator). It's required for every team account.",
    ],
    button: { label: "Accept invite", url },
    footnote: "This invite expires in 48 hours. If you weren't expecting it, ignore this email.",
  })
}

// ---------------------------------------------------------------- host verification and events

export type HostEmailKind = "received" | "approved" | "needs_info" | "denied" | "rejected" | "suspended" | "appeal_received"

export async function sendHostStatusEmail(
  to: string,
  { name, kind, reason, orgName, timing }: { name: string; kind: HostEmailKind; reason?: string; orgName?: string; timing?: string },
): Promise<void> {
  const dashboard = `${siteUrl()}/host`
  const verification = `${siteUrl()}/host/verification`
  const content: Record<HostEmailKind, { subject: string; body: EmailContent }> = {
    received: {
      subject: "We're verifying your details",
      body: {
        preview: "Your host details are with our team.",
        heading: "Thanks, we're checking your details",
        paragraphs: [
          `Hi ${name}, we've received your details and will contact the organizations you listed to confirm the partnership.`,
          timing ?? "",
          "We'll email you as soon as it's done. You can check the status any time on your dashboard.",
        ].filter(Boolean),
        button: { label: "Open my dashboard", url: dashboard },
      },
    },
    appeal_received: {
      subject: "We've received your response",
      body: {
        preview: "Your response is with our team.",
        heading: "Thanks for your response",
        paragraphs: [`Hi ${name}, we've received your explanation and will review it, contacting the organizations again if needed.`, timing ?? ""].filter(Boolean),
        button: { label: "Open my dashboard", url: dashboard },
      },
    },
    approved: {
      subject: "You're verified: start creating events",
      body: {
        preview: "Your host account is verified.",
        heading: "You're verified!",
        paragraphs: [`Hi ${name}, we've confirmed your details. You can now create events. Each event is reviewed before it goes live.`],
        button: { label: "Create an event", url: `${siteUrl()}/host/events/new` },
      },
    },
    needs_info: {
      subject: "We need a little more information",
      body: {
        preview: "Please update your verification details.",
        heading: "We need a little more information",
        paragraphs: [`Hi ${name}, we couldn't finish verifying your details yet.`, ...(reason ? [`What we need: ${reason}`] : []), "Update your details and send them again."],
        button: { label: "Update my details", url: verification },
      },
    },
    denied: {
      subject: "We couldn't verify your partnership",
      body: {
        preview: "An organization you listed didn't confirm the partnership.",
        heading: "We couldn't verify your details",
        paragraphs: [
          `Hi ${name}, when we contacted ${orgName ?? "an organization you listed"}, they did not confirm being involved with you or your event.`,
          ...(reason ? [`Our note: ${reason}`] : []),
          "If there's been a mix-up, reply from your dashboard with an explanation and any supporting documents. You can respond once.",
        ],
        button: { label: "Respond to this decision", url: verification },
      },
    },
    rejected: {
      subject: "Your host application was not approved",
      body: {
        preview: "Your host application was not approved.",
        heading: "Your application was not approved",
        paragraphs: [`Hi ${name}, after reviewing your details we can't approve your host account.`, ...(reason ? [`Reason: ${reason}`] : [])],
        footnote: "If you believe this is a mistake, contact us from the Host page.",
      },
    },
    suspended: {
      subject: "Your host account has been suspended",
      body: {
        preview: "Your host account has been suspended.",
        heading: "Your host account is suspended",
        paragraphs: [`Hi ${name}, your host account has been suspended and your events are no longer listed.`, ...(reason ? [`Reason: ${reason}`] : [])],
        footnote: "Contact us if you'd like to discuss this.",
      },
    },
  }
  const { subject, body } = content[kind]
  await send(to, subject, body)
}

export type EventReviewKind = "submitted" | "approved" | "changes_requested" | "rejected" | "revision_approved" | "revision_rejected"

export async function sendEventReviewEmail(
  to: string,
  { name, title, slug, kind, reason }: { name: string; title: string; slug: string; kind: EventReviewKind; reason?: string },
): Promise<void> {
  const base = siteUrl()
  const map: Record<EventReviewKind, [string, string, string, { label: string; url: string } | undefined]> = {
    submitted: [`Received: ${title}`, "Your event is being reviewed", "We've received your event. We'll check it and contact the organizations involved before it goes live.", { label: "View my events", url: `${base}/host` }],
    approved: [`Live: ${title}`, "Your event is live!", "Your event passed review and is now visible to visitors. You'll see bookings on your dashboard.", { label: "See it live", url: `${base}/events/${slug}` }],
    changes_requested: [`Changes needed: ${title}`, "Your event needs a few changes", "Please update your event and send it for review again.", { label: "Edit my event", url: `${base}/host/events/${slug}/edit` }],
    rejected: [`Not approved: ${title}`, "Your event was not approved", "After review, we can't list this event.", undefined],
    revision_approved: [`Changes approved: ${title}`, "Your changes are live", "We approved your changes. Everyone who booked has been told about any change to the date, time or place.", { label: "See it live", url: `${base}/events/${slug}` }],
    revision_rejected: [`Changes not approved: ${title}`, "Your changes weren't approved", "The event stays as it was. You can propose new changes from your dashboard.", { label: "View my events", url: `${base}/host` }],
  }
  const [subject, heading, sentence, button] = map[kind]
  await send(to, subject, {
    preview: heading,
    heading,
    paragraphs: [`Hi ${name},`, `${sentence}`, ...(reason ? [`Note from our team: ${reason}`] : [])],
    details: [["Event", title]],
    button,
  })
}

/** To the admin team: something is waiting in the approvals queue. */
export async function sendAdminQueueNotice(to: string[], { subject, lines, path }: { subject: string; lines: string[]; path: string }): Promise<void> {
  if (to.length === 0) return
  await send(to, subject, {
    preview: lines[0] ?? subject,
    heading: subject,
    paragraphs: lines,
    button: { label: "Open approvals", url: `${siteUrl()}${path}` },
  }, { bcc: true })
}
