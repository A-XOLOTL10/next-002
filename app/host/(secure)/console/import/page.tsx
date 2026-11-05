import { Suspense } from "react"
import AdminNav from "@/components/admin/AdminNav"
import CopyButton from "@/components/admin/CopyButton"
import ImportForm from "@/components/admin/ImportForm"
import { requireAdmin } from "@/lib/auth"
import { REQUEST_FORM_QUESTIONS, REQUEST_REPLY_TEMPLATE, TEMPLATE_JSON_EXAMPLE } from "@/lib/event-request-form"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

export default function ImportPage() {
  return (
    <>
      <AdminNav />

      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">AI Event Import</h1>
        <p className="text-light-100">
          Upload exported event request forms. Each event found becomes a draft for you to preview and publish.
        </p>
      </div>

      {/* The session check reads a cookie (request-time data), so this part streams in. */}
      <Suspense fallback={<p>Loading...</p>}>
        <ImportSection />
      </Suspense>
    </>
  )
}

async function ImportSection() {
  // Signed-in admins only (checked in lib/admin-data.ts). importEventsAction checks again on submit.
  await requireAdmin()

  return (
    <>
      <ImportForm />

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Replying to an organizer</h2>
        <p className="text-light-100 text-sm">
          Build a form with these questions (Google Forms works well: Responses &rarr; Download responses gives a CSV),
          then send this reply with your form link.
        </p>

        <ol className="text-light-100 list-inside list-decimal text-sm">
          {REQUEST_FORM_QUESTIONS.map((question) => <li key={question}>{question}</li>)}
        </ol>

        <pre className="bg-dark-100 border-dark-200 rounded-md border p-4 text-xs whitespace-pre-wrap">{REQUEST_REPLY_TEMPLATE}</pre>
        <CopyButton text={REQUEST_REPLY_TEMPLATE} label="Copy reply" />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Importing without AI</h2>
        <p className="text-light-100 text-sm">
          A .json file in this format is imported directly, with no AI and no API key needed.
        </p>
        <pre className="bg-dark-100 border-dark-200 overflow-x-auto rounded-md border p-4 text-xs">
          {JSON.stringify(TEMPLATE_JSON_EXAMPLE, null, 2)}
        </pre>
      </section>
    </>
  )
}
