"use server"

import { redirect } from "next/navigation"
import { refresh, updateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import { deleteSession, requireAdmin, signInAdmin, verifyPublishPin } from "@/lib/auth"
import { bookingsTag } from "@/lib/cache-tags"
import { createEvent, deleteEvent, publishEvents, updateEvent, type PublishOutcome } from "@/lib/events.service"
import { importEventForms, type ImportResult } from "@/lib/ai-import"
import { getTicketForCheckIn, type TicketCheckIn } from "@/lib/admin-data"
import { LIMITS, consumeAttempt } from "@/lib/rate-limit"
import { hasEnded } from "@/lib/utils"

// Server Actions are public endpoints: anyone can call them directly, not just our forms.
// So every admin action (except login) starts with requireAdmin().

export type LoginState = { error: string } | null

/** Returned by the event form actions on failure; on success they redirect instead. */
export type EventFormState = { message: string; errors?: Record<string, string> } | null

export type PublishState = { message: string; outcome?: PublishOutcome } | null

export type ImportState = { error: string } | ImportResult | null

export type CheckInState = { ok: boolean; message: string; ticket?: TicketCheckIn } | null

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email")
  const password = formData.get("password")

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return { error: "Please enter your email and password." }
  }

  const result = await signInAdmin(email, password)
  // The same message for a wrong email or password, so it doesn't reveal which one is right.
  if (result === "invalid") return { error: "Invalid email or password." }
  if (result === "locked") return { error: "Too many failed attempts. Try again in 15 minutes." }
  if (result === "unconfigured") return { error: "Admin login isn't set up yet. Check the server log for the setting to fix." }

  redirect("/admin")
}

export async function logout(): Promise<void> {
  await deleteSession()
  redirect("/admin/login")
}

/** Cancels one booking. Bound in the admin page: cancelBooking.bind(null, bookingId). */
export async function cancelBooking(bookingId: string): Promise<{ error: string } | void> {
  await requireAdmin()

  if (!OBJECT_ID_PATTERN.test(bookingId)) return { error: "Invalid booking." }

  try {
    await connectDB()
    const deleted = await Booking.findByIdAndDelete(bookingId).select("eventId").lean()
    if (!deleted) return { error: "This booking no longer exists." }

    // The public booking count is cached; clear it so the event page shows the new number.
    updateTag(bookingsTag(deleted.eventId.toString()))
  } catch (e) {
    console.error("Cancel booking failed:", e)
    return { error: "Couldn't cancel the booking. Please try again." }
  }

  // Re-render the admin page so the cancelled row disappears.
  refresh()
}

// ---------------------------------------------------------------- events

/** Admin "Create event" form. The new event is a draft, so this goes to its preview. */
export async function createEventAction(_prevState: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireAdmin()

  const result = await createEvent(formData)
  if (!result.ok) return { message: result.message, errors: result.errors }

  redirect(`/admin/drafts/${result.data.slug}`)
}

/** Admin "Edit event" form, bound to the event's current slug. */
export async function updateEventAction(
  slug: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdmin()

  const result = await updateEvent(slug, formData)
  if (!result.ok) return { message: result.message, errors: result.errors }

  redirect(result.data.status === "draft" ? `/admin/drafts/${result.data.slug}` : `/admin/events/${result.data.slug}`)
}

/** Deletes an event (or discards a draft) and its bookings, then returns to the dashboard. */
export async function deleteEventAction(slug: string): Promise<{ error: string } | void> {
  await requireAdmin()

  const result = await deleteEvent(slug)
  if (!result.ok) return { error: result.message }

  redirect("/admin")
}

/** The last gate before visitors see an event: needs the signed-in admin and the PIN. */
export async function publishEventsAction(
  slugs: string[],
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireAdmin()

  const pin = formData.get("pin")
  if (typeof pin !== "string" || !pin.trim()) return { message: "Enter your publish PIN." }

  const check = await verifyPublishPin(pin)
  if (check === "wrong") return { message: "That PIN is incorrect." }
  if (check === "locked") return { message: "Too many wrong PINs. Try again in 15 minutes." }
  if (check === "unconfigured") return { message: "Publishing isn't set up yet: ADMIN_PUBLISH_PIN is missing on the server." }

  const result = await publishEvents(slugs)
  if (!result.ok) return { message: result.message }

  const { published, failed } = result.data
  // Everything went live: there's nothing left to review here.
  if (failed.length === 0) redirect("/admin")

  // No refresh(): it could remove this panel (and the list of what failed) from the page.
  return { message: `${published.length} published, ${failed.length} need attention.`, outcome: result.data }
}

// ---------------------------------------------------------------- AI import

/** Reads exported event request forms and creates a draft for each event found. */
export async function importEventsAction(_prevState: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin()

  if (!(await consumeAttempt("ai-import", LIMITS.aiImport))) {
    return { error: "Import limit reached. Try again in an hour." }
  }

  const result = await importEventForms(formData)
  refresh()
  return result
}

// ---------------------------------------------------------------- check-in

/** Admits a ticket at the door. One atomic update, so a QR code can only ever be used once. */
export async function checkInTicket(ticketId: string): Promise<CheckInState> {
  await requireAdmin()

  try {
    await connectDB()

    const ticket = await getTicketForCheckIn(ticketId)
    if (!ticket) return { ok: false, message: "Ticket not found. It may be invalid or cancelled." }
    if (ticket.status !== "confirmed") return { ok: false, message: "This booking was never confirmed.", ticket }
    if (hasEnded(ticket.event?.hideAt)) return { ok: false, message: "This ticket's event is over.", ticket }

    // Only matches a ticket that hasn't been used, so two simultaneous scans can't both pass.
    const admitted = await Booking.findOneAndUpdate(
      { ticketId: ticket.ticketId, status: "confirmed", checkedInAt: { $exists: false } },
      { $set: { checkedInAt: new Date() } },
      { returnDocument: "after" },
    ).lean()

    // No refresh(): re-rendering the page now would show this ticket as "already used" and
    // replace the green "Admitted" with a red warning.
    const updated = await getTicketForCheckIn(ticketId)
    if (!admitted) return { ok: false, message: "Already used. This ticket has been scanned before.", ticket: updated ?? ticket }
    return { ok: true, message: "Admitted. Welcome!", ticket: updated ?? ticket }
  } catch (e) {
    console.error("Check-in failed:", e)
    return { ok: false, message: "Couldn't check this ticket. Please try again." }
  }
}
