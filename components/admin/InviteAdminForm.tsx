"use client"

import { useActionState } from "react"
import { inviteAdminAction, type ConsoleState } from "@/lib/actions/console.actions"
import { keepValues } from "@/components/useKeepValues"

/** Super admin only: invite a supra admin by name and email. */
export default function InviteAdminForm() {
  const [state, formAction, pending] = useActionState<ConsoleState, FormData>(inviteAdminAction, null)
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        // Adding someone to the team gives them access to hosts' documents: confirm first.
        if (!window.confirm("Invite this person as a supra admin? They'll be able to review hosts, see their documents and publish events.")) return e.preventDefault()
        keepValues(formAction)(e)
      }}
      className="bg-dark-100 border-dark-200 flex flex-wrap items-end gap-3 rounded-[10px] border p-4"
    >
      <label className="flex min-w-48 flex-1 flex-col gap-2 text-sm">
        <span className="font-semibold">Full name</span>
        <input name="name" required minLength={2} maxLength={120} className="admin-input" />
      </label>
      <label className="flex min-w-56 flex-1 flex-col gap-2 text-sm">
        <span className="font-semibold">Email</span>
        <input name="email" type="email" required maxLength={254} className="admin-input" />
      </label>
      <button type="submit" disabled={pending} className="admin-button">{pending ? "Inviting..." : "Send invite"}</button>
      {state?.message && (
        <p className={`w-full text-sm ${state.ok ? "text-green-400" : "text-red-400"}`} role="alert">
          {state.message}
          {typeof state.data?.link === "string" && <span className="mt-1 block break-all font-mono text-xs">{state.data.link}</span>}
        </p>
      )}
    </form>
  )
}
