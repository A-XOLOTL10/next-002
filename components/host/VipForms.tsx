"use client"

import { useActionState } from "react"
import { keepValues } from "@/components/useKeepValues"
import type { VipState } from "@/lib/actions/vip.actions"
import { VIP_RULES } from "@/database/ticket.constants"

type Action = (prev: VipState, formData: FormData) => Promise<VipState>

const Status = ({ state }: { state: VipState }) =>
  state?.message ? (
    <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-green-400" : "text-red-400"}`}>{state.message}</p>
  ) : null

/** Paste VIP emails. Each one is sent a VIP ticket as soon as it's added. */
export function AddVipForm({ action, disabled }: { action: Action; disabled: boolean }) {
  const [state, formAction, pending] = useActionState(action, null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-3">
      <label htmlFor="emails" className="text-sm font-semibold">Add VIP guests</label>
      <textarea
        id="emails"
        name="emails"
        rows={4}
        required
        disabled={disabled}
        placeholder={"ada@company.com\nkemi@partner.org, tunde@sponsor.ng"}
        className="admin-input font-mono text-sm"
      />
      <p className="text-light-200 text-xs">
        One per line, or separated by commas. Up to {VIP_RULES.maxPerSubmit} at a time and {VIP_RULES.maxPerEvent} per event. Each person is emailed their VIP
        ticket (QR code and DEV- ticket ID) straight away; if they already booked, their ticket becomes VIP.
      </p>
      <Status state={state} />
      <button type="submit" disabled={pending || disabled} className="admin-button w-fit">{pending ? "Sending tickets..." : "Add and send tickets"}</button>
    </form>
  )
}

/** What door staff hand out to each kind of guest; shown on the scanner after every scan. */
export function DoorTagsForm({ action, initial }: { action: Action; initial: { regular: string; vip: string } }) {
  const [state, formAction, pending] = useActionState(action, null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Regular guests get</span>
          <input name="regular" defaultValue={initial.regular} maxLength={VIP_RULES.tagMaxLength} placeholder="e.g. Blue wristband" className="admin-input" />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">VIP guests get</span>
          <input name="vip" defaultValue={initial.vip} maxLength={VIP_RULES.tagMaxLength} placeholder="e.g. Gold lanyard + front rows" className="admin-input" />
        </label>
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending} className="admin-button w-fit">{pending ? "Saving..." : "Save door tags"}</button>
    </form>
  )
}
