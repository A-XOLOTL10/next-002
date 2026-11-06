"use client"

/* eslint-disable @next/next/no-img-element -- QR codes are data: URLs made on the server */
import { useActionState, useEffect, useState } from "react"
import { keepValues } from "@/components/useKeepValues"
import { createLinkCodeAction, createStaffPassAction } from "@/lib/actions/scanner.actions"

/** "4:59 left", ticking down; null once it's run out. */
function useTimeLeft(expiresAt?: string): string | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])
  if (!expiresAt) return null
  const left = Math.max(0, new Date(expiresAt).getTime() - now)
  if (left === 0) return null
  return `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} left`
}

function QrCard({ qr, expiresAt, caption }: { qr: string; expiresAt: string; caption: string }) {
  const left = useTimeLeft(expiresAt)
  if (!left) return <p className="notice">That code has expired. Make a new one.</p>
  return (
    <div className="flex flex-col items-start gap-2">
      <img src={qr} alt="Setup QR code for the DevEvent Scanner app" width={240} height={240} className="rounded-md bg-white p-2" />
      <p className="text-sm">{caption}</p>
      <p className="text-light-200 text-xs">Works once · {left}</p>
    </div>
  )
}

const ErrorText = ({ message }: { message?: string }) => (message ? <p className="text-sm text-red-400" role="alert">{message}</p> : null)

/** Link the admin's own phone: authenticator code first, then a 5-minute QR code. */
export function LinkPhoneForm() {
  const [state, formAction, pending] = useActionState(createLinkCodeAction, null)
  const data = state?.ok ? (state.data as { qr: string; expiresAt: string }) : null
  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Authenticator code</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" maxLength={6} placeholder="123456" className="admin-input w-36 font-mono" />
        </label>
        <button type="submit" disabled={pending} className="admin-button">{pending ? "Checking..." : "Show link code"}</button>
      </form>
      <ErrorText message={state?.ok ? undefined : state?.message} />
      {data && <QrCard key={data.expiresAt} qr={data.qr} expiresAt={data.expiresAt} caption={'In the app, choose "I\'m an admin" and scan this with your own phone.'} />}
    </div>
  )
}

const DURATIONS = [
  { value: "0", label: "Until the event ends" },
  { value: "4", label: "4 hours" },
  { value: "8", label: "8 hours" },
  { value: "12", label: "12 hours" },
]

/** A staff pass: one event, one staff member, scan-only. */
export function StaffPassForm({ events }: { events: { id: string; title: string; date: string; location: string }[] }) {
  const [state, formAction, pending] = useActionState(createStaffPassAction, null)
  const data = state?.ok ? (state.data as { qr: string; expiresAt: string; deviceExpiresAt: string; eventTitle: string; label: string }) : null
  if (events.length === 0) return <p className="text-light-200 text-sm">No live events to check in right now.</p>
  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} onSubmit={keepValues(formAction)} className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-2 text-sm sm:col-span-3">
          <span className="font-semibold">Event</span>
          <select name="eventId" required className="admin-input">
            {events.map((e) => <option key={e.id} value={e.id}>{e.title} · {e.date} · {e.location}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm sm:col-span-2">
          <span className="font-semibold">Who will use it</span>
          <input name="label" required minLength={2} maxLength={60} placeholder="Gate A, Tunde" className="admin-input" />
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Works for</span>
          <select name="hours" defaultValue="0" className="admin-input">
            {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={pending} className="admin-button w-fit">{pending ? "Making pass..." : "Make staff pass"}</button>
      </form>
      <ErrorText message={state?.ok ? undefined : state?.message} />
      {data && (
        <QrCard
          key={data.expiresAt}
          qr={data.qr}
          expiresAt={data.expiresAt}
          caption={`For ${data.label}: in the app on THEIR phone, choose "I'm door staff" and scan this. It can check in "${data.eventTitle}" only, until ${new Date(data.deviceExpiresAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`}
        />
      )}
    </div>
  )
}
