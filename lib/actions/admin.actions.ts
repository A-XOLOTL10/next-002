"use server"

import { redirect } from "next/navigation"
import { refresh, updateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import Event from "@/database/event.model"
import { actorOf, requireAdmin, requireUser, verifyPublishPin } from "@/lib/auth"
import { bookingsTag } from "@/lib/cache-tags"
import { createEvent, deleteEvent, publishEvents, updateEvent, type PublishOutcome } from "@/lib/events.service"
import { importEventForms, type ImportResult } from "@/lib/ai-import"
import { getTicketForCheckIn, type TicketCheckIn } from "@/lib/admin-data"
import { LIMITS, consumeAttempt } from "@/lib/rate-limit"
import { logAction, snapshotHash } from "@/lib/audit"
import { hasEnded } from "@/lib/utils"

// Server Actions are public endpoints: anyone can call them directly, not just our forms.
// So every action starts with requireAdmin() (or, for check-in, a per-ticket permission check),
// and every change is written to the activity log with who did it.

/** Returned by the event form actions on failure; on success they redirect instead. */
export type EventFormState = { message: string; errors?: Record<string, string> } | null

export type PublishState = { message: string; outcome?: PublishOutcome } | null

export type ImportState = { error: string } | ImportResult | null

export type CheckInState = { ok: boolean; message: string; ticket?: TicketCheckIn } | null

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

/** Cancels one booking. Bound in the admin page: cancelBooking.bind(null, bookingId). */
export async function cancelBooking(bookingId: string): Promise<{ error: string } | void> {
  const session = await requireAdmin()

  if (!OBJECT_ID_PATTERN.test(bookingId)) return { error: "Invalid booking." }

  try {
    await connectDB()
    const deleted = await Booking.findByIdAndDelete(bookingId).select("eventId email ticketId").lean()
    if (!deleted) return { error: "This booking no longer exists." }

    // The public booking count is cached; clear it so the event page shows the new number.
    updateTag(bookingsTag(deleted.eventId.toString()))
    await logAction({ actor: actorOf(session), category: "bookings", action: "booking.cancel", severity: "warning", summary: `${session.user.name} cancelled the booking for ${deleted.email}`, target: { type: "booking", id: bookingId, label: deleted.ticketId } })
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
  const session = await requireAdmin()

  const result = await createEvent(formData)
  if (!result.ok) return { message: result.message, errors: result.errors }

  await logAction({ actor: actorOf(session), category: "events", action: "event.create", summary: `${session.user.name} created the draft "${result.data.title}"`, target: { type: "event", id: result.data._id, label: result.data.slug } })
  redirect(`/host/console/drafts/${result.data.slug}`)
}

/** Admin "Edit event" form, bound to the event's current slug. */
export async function updateEventAction(
  slug: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const session = await requireAdmin()

  const result = await updateEvent(slug, formData)
  if (!result.ok) return { message: result.message, errors: result.errors }

  await logAction({
    actor: actorOf(session),
    category: "events",
    action: "event.update",
    severity: result.data.status === "published" ? "warning" : "info",
    summary: `${session.user.name} edited "${result.data.title}"${result.data.status === "published" ? " (live event)" : ""}`,
    target: { type: "event", id: result.data._id, label: result.data.slug },
    details: { fields: [...new Set([...formData.keys()])].filter((key) => !["images", "removeImages"].includes(key)) },
  })
  redirect(result.data.status === "published" ? `/host/console/events/${result.data.slug}` : `/host/console/drafts/${result.data.slug}`)
}

/** Deletes an event (or discards a draft) and its bookings, then returns to the dashboard. */
export async function deleteEventAction(slug: string): Promise<{ error: string } | void> {
  const session = await requireAdmin()

  const result = await deleteEvent(slug)
  if (!result.ok) return { error: result.message }

  await logAction({ actor: actorOf(session), category: "events", action: "event.delete", severity: "critical", summary: `${session.user.name} deleted "${result.data.slug}" and ${result.data.deletedBookings} bookings`, target: { type: "event", label: result.data.slug } })
  redirect("/host/console")
}

/** The last gate before visitors see an admin-created event: the signed-in admin and the PIN. */
export async function publishEventsAction(
  slugs: string[],
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  const session = await requireAdmin()

  const pin = formData.get("pin")
  if (typeof pin !== "string" || !pin.trim()) return { message: "Enter your publish PIN." }

  const check = await verifyPublishPin(pin)
  if (check === "wrong") {
    await logAction({ actor: actorOf(session), category: "security", action: "publish.pin_wrong", severity: "warning", summary: `${session.user.name} entered a wrong publish PIN` })
    return { message: "That PIN is incorrect." }
  }
  if (check === "locked") return { message: "Too many wrong PINs. Try again in 15 minutes." }
  if (check === "unconfigured") return { message: "Publishing isn't set up yet: ADMIN_PUBLISH_PIN is missing on the server." }

  // Host events have their own review (approve in Approvals), so only admin drafts publish here.
  await connectDB()
  const hostOwned = await Event.find({ slug: { $in: slugs }, ownerId: { $exists: true } }).select("slug").lean()
  const adminSlugs = slugs.filter((slug) => !hostOwned.some((e) => e.slug === slug))

  const result = await publishEvents(adminSlugs)
  if (!result.ok) return { message: result.message }

  const published = await Event.find({ slug: { $in: result.data.published } }).lean()
  for (const event of published) {
    await logAction({
      actor: actorOf(session),
      category: "events",
      action: "event.publish",
      severity: "warning",
      summary: `${session.user.name} published "${event.title}"`,
      target: { type: "event", id: event._id.toString(), label: event.slug },
      snapshotHash: snapshotHash({ ...event, updatedAt: undefined, publishedAt: undefined }),
    })
  }

  const { failed } = result.data
  if (failed.length === 0 && hostOwned.length === 0) redirect("/host/console")

  // No refresh(): it could remove this panel (and the list of what failed) from the page.
  return {
    message: `${result.data.published.length} published, ${failed.length + hostOwned.length} need attention.`,
    outcome: { ...result.data, failed: [...failed, ...hostOwned.map((e) => ({ slug: e.slug, title: e.slug, message: "Host events are approved from Approvals" }))] },
  }
}

// ---------------------------------------------------------------- AI import

/** Reads exported event request forms and creates a draft for each event found. */
export async function importEventsAction(_prevState: ImportState, formData: FormData): Promise<ImportState> {
  const session = await requireAdmin()

  if (!(await consumeAttempt("ai-import", LIMITS.aiImport))) {
    return { error: "Import limit reached. Try again in an hour." }
  }

  const result = await importEventForms(formData)
  if (!("error" in result)) {
    const created = result.events.filter((e) => e.outcome === "created")
    await logAction({ actor: actorOf(session), category: "events", action: "event.ai_import", summary: `${session.user.name} imported ${created.length} draft(s) with AI`, details: { titles: created.map((e) => e.title) } })
  }
  refresh()
  return result
}

// ---------------------------------------------------------------- check-in

/**
 * Admits a ticket at the door. Admins can admit any ticket; a host only tickets for their own
 * events. One atomic update, so a QR code can only ever be used once.
 */
export async function checkInTicket(ticketId: string): Promise<CheckInState> {
  const session = await requireUser()

  try {
    await connectDB()

    // getTicketForCheckIn returns null for tickets this account may not see.
    const ticket = await getTicketForCheckIn(ticketId)
    if (!ticket) return { ok: false, message: "Ticket not found. It may be invalid, cancelled, or for another host's event." }
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
    await logAction({
      actor: actorOf(session),
      category: "bookings",
      action: admitted ? "checkin.admit" : "checkin.reused",
      severity: admitted ? "info" : "warning",
      summary: admitted ? `${session.user.name} admitted ${ticket.ticketId} to "${ticket.event?.title}"` : `${session.user.name} scanned ${ticket.ticketId} again (already used)`,
      target: { type: "ticket", label: ticket.ticketId },
    })
    if (!admitted) return { ok: false, message: "Already used. This ticket has been scanned before.", ticket: updated ?? ticket }
    return { ok: true, message: "Admitted. Welcome!", ticket: updated ?? ticket }
  } catch (e) {
    console.error("Check-in failed:", e)
    return { ok: false, message: "Couldn't check this ticket. Please try again." }
  }
}
