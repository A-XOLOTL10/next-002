"use server"

import { redirect } from "next/navigation"
import connectDB from "@/lib/mongodb"
import User from "@/database/user.model"
import { getSession, signInWithPassword, signOut, verifyChallenge, actorOf } from "@/lib/auth"
import { acceptInvite, confirmEmail, requestPasswordReset, resendVerification, resetPassword, signUpHost } from "@/lib/accounts"
import { logAction } from "@/lib/audit"

// Server Actions for the sign-in pages. Each one is a public endpoint, so every input is
// checked here again even though the forms check it too.

export type FormState = { error?: string; field?: string; notice?: string; devLink?: string; unverifiedEmail?: string } | null

const text = (formData: FormData, key: string, max = 500): string => {
  const value = formData.get(key)
  return typeof value === "string" ? value.slice(0, max) : ""
}

/** Email + password. Redirects on success (to the dashboard, or to the "confirm it's you" step). */
export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = text(formData, "email", 254)
  const password = text(formData, "password", 300)
  if (!email.trim() || !password) return { error: "Enter your email and password." }

  const result = await signInWithPassword(email, password, text(formData, "next", 300) || null)
  if (result.ok === false) return { error: result.error, unverifiedEmail: result.unverifiedEmail }
  redirect(result.redirectTo)
}

/** The second step for admins: authenticator code, backup code, or emailed code. */
export async function verifyChallengeAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const code = text(formData, "code", 40)
  if (!code.trim()) return { error: "Enter the code." }
  const result = await verifyChallenge(code)
  if (result.ok === false) return { error: result.error }
  redirect(result.redirectTo) // the next step's page, or the console
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  if (formData.get("terms") !== "on") return { error: "Please accept the terms and privacy policy.", field: "terms" }
  const result = await signUpHost({ name: text(formData, "name", 200), email: text(formData, "email", 254), password: text(formData, "password", 300) })
  if (!result.ok) return { error: result.error, field: result.field }
  return { notice: "Check your inbox for a link to confirm your email. It expires in 24 hours.", devLink: result.devLink }
}

export async function resendVerificationAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { devLink } = await resendVerification(text(formData, "email", 254))
  return { notice: "If that account is waiting for confirmation, we've sent a new link.", devLink }
}

/** The button on the confirmation page (a button, not the link itself: email scanners open links). */
export async function confirmEmailAction(token: string): Promise<FormState> {
  const result = await confirmEmail(token)
  if (result.ok === false) return { error: result.error }
  redirect(result.redirectTo)
}

export async function forgotPasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const { devLink } = await requestPasswordReset(text(formData, "email", 254))
  return { notice: "If an account uses that email, we've sent a link to reset the password. It expires in 1 hour.", devLink }
}

export async function resetPasswordAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const password = text(formData, "password", 300)
  if (password !== text(formData, "confirm", 300)) return { error: "The two passwords don't match.", field: "confirm" }
  const result = await resetPassword(token, password)
  if (!result.ok) return { error: result.error, field: "password" }
  redirect("/host/login?notice=password_changed")
}

export async function acceptInviteAction(token: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const password = text(formData, "password", 300)
  if (password !== text(formData, "confirm", 300)) return { error: "The two passwords don't match.", field: "confirm" }
  const result = await acceptInvite(token, password)
  if (!result.ok) return { error: result.error, field: "password" }
  redirect("/host/login?notice=invite_accepted")
}

export async function logoutAction(): Promise<void> {
  await signOut()
  redirect("/host/login?notice=signed_out")
}

/** The last welcome slide: mark onboarding done, then on to verification. */
export async function finishOnboardingAction(): Promise<void> {
  const session = await getSession()
  if (!session) redirect("/host/login")
  await connectDB()
  await User.updateOne({ _id: session.user.id, onboardedAt: { $exists: false } }, { $set: { onboardedAt: new Date() } })
  await logAction({ actor: actorOf(session), category: "navigation", action: "host.onboarded", summary: `${session.user.name} finished the welcome slides` })
  redirect("/host/verification")
}
