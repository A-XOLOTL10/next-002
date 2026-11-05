"use client"

import { useActionState } from "react"
import { submitAppealAction, type ActionState } from "@/lib/actions/host.actions"
import { DOCUMENT_RULES } from "@/database/user.constants"
import { keepValues } from "@/components/useKeepValues"

/** The host's one response to a denial: an explanation and up to 3 supporting documents. */
export default function AppealForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(submitAppealAction, null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="bg-dark-100 border-dark-200 flex flex-col gap-4 rounded-[10px] border p-5">
      <h2 className="text-xl font-semibold">Respond to this decision</h2>
      <p className="text-light-200 text-sm">
        Explain what happened (for example, a new contact person at the sponsor) and attach anything that helps, such as a signed letter. You can respond once.
      </p>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Your explanation</span>
        <textarea name="message" rows={6} required minLength={20} maxLength={4000} className="admin-input" />
        {state?.errors?.message && <span className="text-xs text-red-400">{state.errors.message}</span>}
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Supporting documents (optional, up to 3)</span>
        <input name="files" type="file" accept={DOCUMENT_RULES.accept} multiple className="admin-input" />
      </label>
      {state?.message && <p className="text-sm text-red-400" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="admin-button w-fit">{pending ? "Sending..." : "Send my response"}</button>
    </form>
  )
}
