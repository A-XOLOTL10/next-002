"use client"

import { useActionState, useRef } from "react"
import { reportEventAction, type ActionState } from "@/lib/actions/host.actions"
import { REPORT_REASONS, REPORT_REASON_LABELS } from "@/database/report.constants"
import { keepValues } from "@/components/useKeepValues"

/**
 * "Report this event", for anyone who thinks an event is fake, unsafe or misleading. Opens a small
 * dialog; reports go straight to the admin team's approvals queue.
 */
export default function ReportEventButton({ slug }: { slug: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reportEventAction.bind(null, slug), null)

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className="text-light-200 w-fit cursor-pointer text-xs hover:underline">
        Report this event
      </button>
      <dialog ref={dialog} aria-labelledby="report-title" className="bg-dark-100 border-dark-200 text-light-100 m-auto w-[min(92vw,28rem)] rounded-[10px] border p-0 backdrop:bg-black/70">
        {state?.ok ? (
          <div className="flex flex-col gap-4 p-5">
            <p className="text-green-400" role="status">{state.message}</p>
            <button type="button" onClick={() => dialog.current?.close()} className="admin-button w-fit">Close</button>
          </div>
        ) : (
          <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-4 p-5">
            <h2 id="report-title" className="text-xl font-bold text-white">Report this event</h2>
            <fieldset className="flex flex-col gap-2 text-sm">
              <legend className="mb-1 font-semibold">What&apos;s wrong?</legend>
              {REPORT_REASONS.map((reason) => (
                <label key={reason} className="flex items-center gap-2">
                  <input type="radio" name="reason" value={reason} required /> {REPORT_REASON_LABELS[reason]}
                </label>
              ))}
            </fieldset>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">Details (optional)</span>
              <textarea name="details" rows={3} maxLength={2000} className="admin-input" />
            </label>
            <label className="flex flex-col gap-2 text-sm">
              <span className="font-semibold">Your email, if we may follow up (optional)</span>
              <input name="contactEmail" type="email" maxLength={254} className="admin-input" />
            </label>
            {state?.message && <p className="text-sm text-red-400" role="alert">{state.message}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => dialog.current?.close()} className="cursor-pointer px-4 py-2 text-sm hover:underline">Cancel</button>
              <button type="submit" disabled={pending} className="admin-button px-4 py-2 text-sm">{pending ? "Sending..." : "Send report"}</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  )
}
