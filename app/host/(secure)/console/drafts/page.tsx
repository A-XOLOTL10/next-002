import { Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import AdminNav from "@/components/admin/AdminNav"
import DeleteEventButton from "@/components/admin/DeleteEventButton"
import PublishPanel from "@/components/admin/PublishPanel"
import { getDrafts } from "@/lib/admin-data"

export default function DraftsPage() {
  return (
    <>
      <AdminNav />

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Drafts</h1>
        <p className="text-light-100">New events wait here until you&apos;ve previewed them and published with your PIN.</p>
      </div>

      {/* The session cookie is request-time data, so the list streams in. */}
      <Suspense fallback={<p>Loading drafts...</p>}>
        <DraftList />
      </Suspense>
    </>
  )
}

async function DraftList() {
  // Redirects to /admin/login if not signed in.
  const drafts = await getDrafts()

  if (drafts.length === 0) {
    return (
      <p>
        No drafts right now. <Link href="/admin/import" className="underline">Import event forms</Link> or{" "}
        <Link href="/admin/events/new" className="underline">create an event</Link>.
      </p>
    )
  }

  const ready = drafts.filter((draft) => draft.missing.length === 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4">
        {drafts.map((draft) => (
          <div key={draft.slug} className="bg-dark-100 border-dark-200 flex flex-wrap gap-4 rounded-[10px] border p-4">
            <div className="bg-dark-200 relative h-[101px] w-[180px] shrink-0 overflow-hidden rounded-md">
              {draft.image && <Image src={draft.image} alt="" fill sizes="180px" className="object-cover" />}
            </div>

            <div className="flex min-w-60 flex-1 flex-col gap-1">
              <Link href={`/admin/drafts/${draft.slug}`} className="text-lg font-semibold hover:underline">{draft.title}</Link>
              <p className="text-light-200 text-sm">
                {[draft.date, draft.location].filter(Boolean).join(" · ") || "No date or location yet"}
                {draft.source === "ai-import" && " · from AI import"}
              </p>

              {draft.missing.length > 0 ? (
                <p className="text-sm text-amber-400">Missing: {draft.missing.join(", ")}</p>
              ) : (
                <p className="text-sm text-green-400">Ready to publish</p>
              )}

              {draft.importNotes.map((note) => (
                <p key={note} className="text-light-200 text-xs">{note}</p>
              ))}

              <div className="mt-1 flex flex-wrap gap-4 text-sm">
                <Link href={`/admin/drafts/${draft.slug}`} className="font-semibold hover:underline">Preview</Link>
                <Link href={`/admin/events/${draft.slug}/edit`} className="hover:underline">Edit</Link>
                <DeleteEventButton slug={draft.slug} title={draft.title} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {ready.length > 0 && (
        <div className="max-w-sm">
          <PublishPanel slugs={ready.map((draft) => draft.slug)} label={`Publish ${ready.length} ready ${ready.length === 1 ? "event" : "events"}`} />
        </div>
      )}
    </div>
  )
}
