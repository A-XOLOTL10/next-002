"use client"

import { useActionState } from "react"
import Link from "next/link"
import { publishEventsAction, type PublishState } from "@/lib/actions/admin.actions"

/** The final permission: the admin enters the PIN to publish one draft or several. */
const PublishPanel = ({ slugs, label }: { slugs: string[]; label: string }) => {
  const [state, formAction, pending] = useActionState<PublishState, FormData>(publishEventsAction.bind(null, slugs), null)

  return (
    <form action={formAction} className="bg-dark-100 border-dark-200 flex flex-col gap-3 rounded-[10px] border px-5 py-5">
      <label htmlFor="pin" className="text-sm font-semibold">Publish PIN</label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        required
        className="admin-input"
      />

      {state?.message && <p className="text-sm text-red-400" role="alert">{state.message}</p>}

      {state?.outcome?.failed.map((failure) => (
        <p key={failure.slug} className="text-xs text-red-400">
          <Link href={`/admin/drafts/${failure.slug}`} className="underline">{failure.title}</Link>: {failure.message}
          {failure.errors && ` (${Object.keys(failure.errors).join(", ")})`}
        </p>
      ))}

      <button type="submit" disabled={pending} className="admin-button">
        {pending ? "Publishing..." : label}
      </button>
      <p className="text-light-200 text-xs">Publishing makes this visible to all visitors straight away.</p>
    </form>
  )
}

export default PublishPanel
