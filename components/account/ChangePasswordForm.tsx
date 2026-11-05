"use client"

import { useActionState } from "react"
import PasswordInput from "@/components/auth/PasswordInput"
import { keepValues } from "@/components/useKeepValues"
import { changePasswordAction, type ActionState } from "@/lib/actions/host.actions"

export default function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(changePasswordAction, null)
  const err = (key: string) => state?.errors?.[key] && <span className="text-xs text-red-400">{state.errors[key]}</span>

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="bg-dark-100 border-dark-200 flex max-w-md flex-col gap-4 rounded-[10px] border p-5">
      {hasPassword && (
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Current password</span>
          <PasswordInput name="current" autoComplete="current-password" required maxLength={300} />
          {err("current")}
        </label>
      )}
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">New password</span>
        <PasswordInput name="password" autoComplete="new-password" required minLength={12} maxLength={200} />
        <span className="text-light-200 text-xs">At least 12 characters. Other devices are signed out when it changes.</span>
        {err("password")}
      </label>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Type it again</span>
        <PasswordInput name="confirm" autoComplete="new-password" required minLength={12} maxLength={200} />
        {err("confirm")}
      </label>
      {state?.message && <p className={`text-sm ${state.ok ? "text-green-400" : "text-red-400"}`} role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="admin-button w-fit">{pending ? "Saving..." : "Save password"}</button>
    </form>
  )
}
