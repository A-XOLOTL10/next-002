"use client"

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react"
import { keepValues } from "@/components/useKeepValues"

type State = { ok?: boolean; message?: string; data?: Record<string, unknown> } | null

type Props = {
  /** A Server Action, usually bound to its target: decideHostAction.bind(null, id, "approve"). */
  action: (prev: State, formData: FormData) => Promise<State>
  /** The button that opens the dialog. */
  label: string
  title: string
  /** Exactly what will happen, in plain words. */
  description: ReactNode
  confirmLabel: string
  tone?: "primary" | "danger"
  /** Ask for a reason (stored in the log, and shown to the host where relevant). */
  reason?: { label: string; required?: boolean; placeholder?: string }
  /** Ask for the publish PIN (anything that makes content public). */
  pin?: boolean
  /** Type this word to confirm (for actions that can't be undone). */
  typeToConfirm?: string
  buttonClassName?: string
  disabled?: boolean
  /** Extra fields inside the dialog (e.g. a password for closing an account). */
  children?: ReactNode
}

/**
 * Every admin action goes through this: a button opens a dialog that says exactly what will
 * happen, and nothing runs until "Confirm" is pressed (with a reason, PIN or typed word where
 * the action needs one). Uses the native <dialog> element: accessible (focus is trapped,
 * Escape closes it) and no extra JavaScript library.
 */
export default function ConfirmAction({ action, label, title, description, confirmLabel, tone = "primary", reason, pin, typeToConfirm, buttonClassName, disabled, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const form = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(action, null)
  const id = useId()

  // Close after success; the page refreshes itself (or the action redirects).
  useEffect(() => {
    if (state?.ok) {
      dialog.current?.close()
      form.current?.reset()
    }
  }, [state])

  const danger = tone === "danger"
  const trigger = buttonClassName ?? (danger ? "cursor-pointer rounded-[6px] border border-red-400/50 px-3 py-1.5 text-sm font-semibold text-red-400 hover:bg-red-400/10" : "admin-button px-3 py-1.5 text-sm")

  return (
    <>
      <button type="button" className={`${trigger} disabled:cursor-not-allowed disabled:opacity-50`} disabled={disabled} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      {state?.ok && state.message && <span className="text-sm text-green-400" role="status">{state.message}</span>}

      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        className="bg-dark-100 border-dark-200 text-light-100 m-auto w-[min(92vw,30rem)] rounded-[10px] border p-0 backdrop:bg-black/70"
      >
        <form ref={form} action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-4 p-5">
          <h2 id={`${id}-title`} className="text-xl font-bold text-white">{title}</h2>
          <div className="text-sm leading-relaxed">{description}</div>

          {reason && (
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">{reason.label}</span>
              <textarea name="reason" rows={3} required={reason.required} minLength={reason.required ? 5 : undefined} maxLength={2000} placeholder={reason.placeholder} className="admin-input" />
            </label>
          )}
          {pin && (
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">Publish PIN</span>
              <input name="pin" type="password" inputMode="numeric" autoComplete="off" required className="admin-input" />
            </label>
          )}
          {typeToConfirm && (
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">Type {typeToConfirm} to confirm</span>
              <input name="confirmText" required pattern={typeToConfirm} autoComplete="off" className="admin-input" />
            </label>
          )}

          {children}

          {state?.message && !state.ok && <p className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-400" role="alert">{state.message}</p>}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => dialog.current?.close()} className="cursor-pointer rounded-[6px] px-4 py-2 text-sm hover:underline">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              aria-busy={pending}
              className={danger ? "cursor-pointer rounded-[6px] bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500/90 disabled:opacity-60" : "admin-button px-4 py-2 text-sm"}
            >
              {pending ? "Working..." : confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
