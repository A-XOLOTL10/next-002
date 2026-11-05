"use client"

import { useActionState, useState, type ReactNode } from "react"
import Link from "next/link"
import PasswordInput from "@/components/auth/PasswordInput"
import { keepValues } from "@/components/useKeepValues"
import {
  acceptInviteAction,
  confirmEmailAction,
  forgotPasswordAction,
  loginAction,
  resendVerificationAction,
  resetPasswordAction,
  signUpAction,
  verifyChallengeAction,
  type FormState,
} from "@/lib/actions/auth.actions"

// The sign-in, sign-up and recovery forms. They're small Client Components so they can show
// "Signing in..." and errors without a page reload; the work happens in lib/actions/auth.actions.ts.

const Notice = ({ state }: { state: FormState }) => (
  <>
    {state?.error && <p className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-400" role="alert">{state.error}</p>}
    {state?.notice && <p className="rounded-md border border-green-400/40 px-3 py-2 text-sm text-green-400" role="status">{state.notice}</p>}
    {/* Development only (no SMTP): show the link that would have been emailed. */}
    {state?.devLink && (
      <p className="text-light-200 text-xs break-all">
        Development: email isn&apos;t set up, so here&apos;s the link: <a href={state.devLink} className="underline">{state.devLink}</a>
      </p>
    )}
  </>
)

const Field = ({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={htmlFor} className="text-sm font-semibold">{label}</label>
    {children}
    {hint && <p className="text-light-200 text-xs">{hint}</p>}
  </div>
)

const Submit = ({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) => (
  <button type="submit" disabled={pending} aria-busy={pending} className="admin-button py-2.5">
    {pending ? pendingLabel : label}
  </button>
)

const card = "bg-dark-100 border-dark-200 flex w-full flex-col gap-5 rounded-[10px] border px-5 py-6"

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null)
  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} onSubmit={keepValues(formAction)} className={card}>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Email" htmlFor="login-email">
          <input id="login-email" name="email" type="email" autoComplete="username" required maxLength={254} className="admin-input" />
        </Field>
        <Field label="Password" htmlFor="login-password">
          <PasswordInput id="login-password" name="password" autoComplete="current-password" required maxLength={300} />
        </Field>
        <Notice state={state} />
        <Submit pending={pending} label="Sign in" pendingLabel="Signing in..." />
        <Link href="/host/forgot-password" className="text-light-200 text-center text-sm hover:underline">Forgot your password?</Link>
      </form>
      {state?.unverifiedEmail && <ResendLink email={state.unverifiedEmail} />}
    </div>
  )
}

function ResendLink({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState(resendVerificationAction, null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className="flex flex-col gap-2 text-sm">
      <input type="hidden" name="email" value={email} />
      <button type="submit" disabled={pending} className="text-primary cursor-pointer underline">
        {pending ? "Sending..." : "Resend the confirmation link"}
      </button>
      <Notice state={state} />
    </form>
  )
}

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUpAction, null)
  if (state?.notice) return <div className={card}><Notice state={state} /></div>

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className={card}>
      <Field label="Full name" htmlFor="signup-name">
        <input id="signup-name" name="name" autoComplete="name" required minLength={2} maxLength={120} className="admin-input" />
      </Field>
      <Field label="Email" htmlFor="signup-email" hint="A company email helps us verify you faster.">
        <input id="signup-email" name="email" type="email" autoComplete="email" required maxLength={254} className="admin-input" />
      </Field>
      <Field label="Password" htmlFor="signup-password" hint="At least 12 characters. A short phrase works well.">
        <PasswordInput id="signup-password" name="password" autoComplete="new-password" required minLength={12} maxLength={200} />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="terms" required className="mt-1" />
        <span>
          I agree to the <Link href="/terms" className="underline" target="_blank">Terms</Link> and{" "}
          <Link href="/privacy" className="underline" target="_blank">Privacy Policy</Link>.
        </span>
      </label>
      <Notice state={state} />
      <Submit pending={pending} label="Create host account" pendingLabel="Creating account..." />
    </form>
  )
}

export function ChallengeForm({ step }: { step: "totp" | "email" }) {
  const [state, formAction, pending] = useActionState(verifyChallengeAction, null)
  const [useBackup, setUseBackup] = useState(false)
  const label = step === "email" ? "6-digit code from your email" : useBackup ? "Backup code" : "6-digit code from your authenticator app"

  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className={card}>
      <Field label={label} htmlFor="challenge-code">
        <input
          id="challenge-code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={useBackup ? "text" : "numeric"}
          pattern={useBackup ? undefined : "\\d{6}"}
          maxLength={useBackup ? 12 : 6}
          className="admin-input text-center font-mono text-2xl tracking-[0.4em]"
        />
      </Field>
      <Notice state={state} />
      <Submit pending={pending} label="Continue" pendingLabel="Checking..." />
      {step === "totp" && (
        <button type="button" onClick={() => setUseBackup((v) => !v)} className="text-light-200 cursor-pointer text-sm hover:underline">
          {useBackup ? "Use my authenticator app instead" : "Lost your phone? Use a backup code"}
        </button>
      )}
    </form>
  )
}

export function ConfirmEmailButton({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(() => confirmEmailAction(token), null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className={card}>
      <Notice state={state} />
      <Submit pending={pending} label="Confirm my email" pendingLabel="Confirming..." />
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className={card}>
      <Field label="Email" htmlFor="forgot-email">
        <input id="forgot-email" name="email" type="email" autoComplete="email" required maxLength={254} className="admin-input" />
      </Field>
      <Notice state={state} />
      <Submit pending={pending} label="Send reset link" pendingLabel="Sending..." />
    </form>
  )
}

/** Choose a new password: used by the reset link and by admin invites. */
export function NewPasswordForm({ token, kind }: { token: string; kind: "reset" | "invite" }) {
  const action = kind === "reset" ? resetPasswordAction.bind(null, token) : acceptInviteAction.bind(null, token)
  const [state, formAction, pending] = useActionState(action, null)
  return (
    <form action={formAction} onSubmit={keepValues(formAction)} className={card}>
      <Field label="New password" htmlFor="new-password" hint="At least 12 characters. A short phrase works well.">
        <PasswordInput id="new-password" name="password" autoComplete="new-password" required minLength={12} maxLength={200} />
      </Field>
      <Field label="Type it again" htmlFor="confirm-password">
        <PasswordInput id="confirm-password" name="confirm" autoComplete="new-password" required minLength={12} maxLength={200} />
      </Field>
      <Notice state={state} />
      <Submit pending={pending} label={kind === "reset" ? "Save new password" : "Set password and continue"} pendingLabel="Saving..." />
    </form>
  )
}
