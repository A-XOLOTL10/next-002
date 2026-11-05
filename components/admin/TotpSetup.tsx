"use client"

import { useActionState } from "react"
import Image from "next/image"
import { confirmTotpSetupAction, regenerateBackupCodesAction, startTotpSetupAction, type ConsoleState } from "@/lib/actions/console.actions"

/** Backup codes are shown once, right after they're made. */
function BackupCodes({ codes }: { codes: string[] }) {
  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-amber-400/40 p-4">
      <p className="font-semibold text-amber-400">Save these backup codes now. They won&apos;t be shown again.</p>
      <p className="text-light-200 text-sm">Each works once, if you lose your phone. Keep them somewhere safe (a password manager, or printed).</p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-lg sm:grid-cols-5">
        {codes.map((code) => <li key={code} className="list-none">{code}</li>)}
      </ul>
      <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join("\n"))} className="w-fit cursor-pointer text-sm underline">Copy all</button>
    </div>
  )
}

/**
 * Authenticator app setup: 1) get a QR code, 2) scan it and type the first code, 3) save the
 * backup codes. Until step 2 succeeds nothing changes, so a half-finished setup can't lock you out.
 */
export function TotpSetup() {
  const [started, start, starting] = useActionState<ConsoleState, FormData>(startTotpSetupAction, null)
  const [confirmed, confirm, confirming] = useActionState<ConsoleState, FormData>(confirmTotpSetupAction, null)
  const backupCodes = confirmed?.data?.backupCodes as string[] | undefined

  if (backupCodes) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-green-400">Your authenticator app is set up. You&apos;ll be asked for a code each time you sign in.</p>
        <BackupCodes codes={backupCodes} />
        <a href="/host/console" className="admin-button w-fit">Continue to the console</a>
      </div>
    )
  }

  if (!started?.data) {
    return (
      <form action={start} className="flex flex-col gap-3">
        <p className="text-light-100 text-sm">
          Install an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or 1Password). It shows a new
          6-digit code every 30 seconds, so someone with only your password can&apos;t sign in.
        </p>
        <button type="submit" disabled={starting} className="admin-button w-fit">{starting ? "Preparing..." : "Set up authenticator app"}</button>
      </form>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">Scan this QR code with your authenticator app:</p>
      <Image src={started.data.qr as string} alt="QR code for your authenticator app" width={220} height={220} unoptimized className="rounded-md bg-white p-2" />
      <p className="text-light-200 text-xs">
        Can&apos;t scan? Enter this key in the app instead: <span className="font-mono text-white">{started.data.secret as string}</span>
      </p>
      <form action={confirm} className="flex max-w-xs flex-col gap-3">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Enter the 6-digit code the app shows</span>
          <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" className="admin-input text-center font-mono text-2xl tracking-[0.4em]" />
        </label>
        {confirmed?.message && <p className="text-sm text-red-400" role="alert">{confirmed.message}</p>}
        <button type="submit" disabled={confirming} className="admin-button">{confirming ? "Checking..." : "Turn on"}</button>
      </form>
    </div>
  )
}

/** New backup codes (the old ones stop working); needs a current code from the app. */
export function RegenerateBackupCodes() {
  const [state, formAction, pending] = useActionState<ConsoleState, FormData>(regenerateBackupCodesAction, null)
  const codes = state?.data?.backupCodes as string[] | undefined
  if (codes) return <BackupCodes codes={codes} />
  return (
    <form action={formAction} className="flex max-w-xs flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Current code from your app</span>
        <input name="code" inputMode="numeric" pattern="\d{6}" maxLength={6} required autoComplete="one-time-code" className="admin-input font-mono" />
      </label>
      {state?.message && <p className="text-sm text-red-400" role="alert">{state.message}</p>}
      <button type="submit" disabled={pending} className="admin-button w-fit">{pending ? "Making codes..." : "Make new backup codes"}</button>
    </form>
  )
}
