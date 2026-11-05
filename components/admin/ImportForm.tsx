"use client"

import { startTransition, useActionState, type FormEvent } from "react"
import Link from "next/link"
import { importEventsAction, type ImportState } from "@/lib/actions/admin.actions"

const OUTCOME_STYLE = { created: "text-green-400", skipped: "text-amber-400", failed: "text-red-400" } as const

/** Upload exported event request forms and their images; shows what became of each event. */
const ImportForm = () => {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(importEventsAction, null)

  // Submitted manually, so the chosen files survive a failed attempt (see EventForm).
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => formAction(formData))
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="bg-dark-100 border-dark-200 flex flex-col gap-5 rounded-[10px] border px-5 py-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="forms" className="text-sm font-semibold">Exported forms (up to 10 files)</label>
          <input id="forms" name="forms" type="file" accept=".csv,.tsv,.json,.txt,.md,.pdf" multiple required className="admin-input" />
          <p className="text-light-200 text-xs">CSV, TSV, JSON, TXT, Markdown or PDF. Each file can hold many events.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="images" className="text-sm font-semibold">Event images (optional)</label>
          <input id="images" name="images" type="file" accept="image/png,image/jpeg,image/webp" multiple className="admin-input" />
          <p className="text-light-200 text-xs">
            Matched to events by the file names in the form. Public image links in the form are fetched automatically.
          </p>
        </div>

        <button type="submit" disabled={pending} className="admin-button">
          {pending ? "Reading forms... this can take a minute" : "Import events"}
        </button>
      </form>

      {state && "error" in state && <p className="text-sm text-red-400" role="alert">{state.error}</p>}

      {state && "events" in state && (
        <div className="flex flex-col gap-3" role="status">
          <h2 className="text-xl font-semibold">Import results</h2>

          {state.fileErrors.map(({ file, message }) => (
            <p key={file} className="text-sm text-red-400">{file}: {message}</p>
          ))}

          {state.events.length === 0 && state.fileErrors.length === 0 && <p className="text-sm">No events were found in these files.</p>}

          {state.events.map((event, index) => (
            <div key={`${event.title}-${index}`} className="border-dark-200 flex flex-col gap-1 rounded-md border px-4 py-3 text-sm">
              <p>
                <span className={`font-semibold capitalize ${OUTCOME_STYLE[event.outcome]}`}>{event.outcome}: </span>
                {event.slug ? <Link href={`/host/console/drafts/${event.slug}`} className="underline">{event.title}</Link> : event.title}
              </p>
              {event.message && <p className="text-light-200">{event.message}</p>}
              {event.notes.map((note) => <p key={note} className="text-amber-400">{note}</p>)}
            </div>
          ))}

          {state.events.some((event) => event.outcome === "created") && (
            <Link href="/host/console/drafts" className="admin-button w-fit">Review drafts</Link>
          )}
        </div>
      )}
    </div>
  )
}

export default ImportForm
