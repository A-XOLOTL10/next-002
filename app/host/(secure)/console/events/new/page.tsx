import { Suspense } from "react"
import AdminNav from "@/components/admin/AdminNav"
import EventForm from "@/components/admin/EventForm"
import { createEventAction } from "@/lib/actions/admin.actions"
import { requireAdmin } from "@/lib/auth"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

export default function NewEventPage() {
  return (
    <>
      <AdminNav />
      <h1 className="text-3xl font-bold">Create Event</h1>

      {/* The session check reads a cookie (request-time data), so the form streams in. */}
      <Suspense fallback={<p>Loading...</p>}>
        <AuthorizedForm />
      </Suspense>
    </>
  )
}

async function AuthorizedForm() {
  // Signed-in admins only (checked in lib/admin-data.ts). createEventAction checks again on submit.
  await requireAdmin()
  return <EventForm action={createEventAction} submitLabel="Create event" />
}
