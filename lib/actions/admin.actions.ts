"use server"

import { redirect } from "next/navigation"
import { refresh, updateTag } from "next/cache"
import connectDB from "@/lib/mongodb"
import Booking from "@/database/booking.model"
import { checkAdminCredentials, createSession, deleteSession, requireAdmin } from "@/lib/auth"
import { bookingsTag } from "@/lib/cache-tags"
import { createEvent, deleteEvent, updateEvent } from "@/lib/events.service"

// Server Actions are public endpoints: anyone can call them directly, not just our forms.
// So every admin action (except login) starts with requireAdmin().

export type LoginState = { error: string } | null

/** Returned by the event form actions on failure; on success they redirect instead. */
export type EventFormState = { message: string; errors?: Record<string, string> } | null

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email")
  const password = formData.get("password")

  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
    return { error: "Please enter your email and password." }
  }

  try {
    if (!checkAdminCredentials(email, password)) {
      // Same message for a wrong email or password, so it doesn't reveal which one exists.
      return { error: "Invalid email or password." }
    }
    await createSession()
  } catch (e) {
    // Missing ADMIN_* environment variables: a server setup problem, not the user's.
    console.error("Admin login failed:", e)
    return { error: "Admin login isn't configured on the server." }
  }

  // Outside try/catch: redirect() works by throwing, which the catch above would swallow.
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

/** Admin "Create event" form. Redirects to the new event's admin page on success. */
export async function createEventAction(_prevState: EventFormState, formData: FormData): Promise<EventFormState> {
  await requireAdmin()

  const result = await createEvent(formData)
  if (!result.ok) return { message: result.message, errors: result.errors }

  redirect(`/admin/events/${result.data.slug}`)
}

/** Admin "Edit event" form, bound to the event's current slug. Redirects to its (possibly new) slug. */
export async function updateEventAction(
  slug: string,
  _prevState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  await requireAdmin()

  const result = await updateEvent(slug, formData)
  if (!result.ok) return { message: result.message, errors: result.errors }

  redirect(`/admin/events/${result.data.slug}`)
}

/** Deletes an event and its bookings, then returns to the dashboard. */
export async function deleteEventAction(slug: string): Promise<{ error: string } | void> {
  await requireAdmin()

  const result = await deleteEvent(slug)
  if (!result.ok) return { error: result.message }

  redirect("/admin")
}
