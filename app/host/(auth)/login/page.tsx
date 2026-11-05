import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { AuthShell, OAuthButtons } from "@/components/auth/AuthShell"
import { LoginForm } from "@/components/auth/AuthForms"
import SessionLoader from "@/components/SessionLoader"
import { getSession, landingFor } from "@/lib/auth"

// One sign-in page for everyone: hosts, and (without saying so) the admin team. Where people
// land afterwards depends on their account's role (landingFor in lib/auth.ts).

const ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  expired: "That sign-in took too long or was started in another browser. Please try again.",
  provider_unavailable: "That sign-in option isn't available right now. Use your email instead.",
  provider_failed: "We couldn't reach the sign-in provider. Please try again.",
  too_many: "Too many attempts. Please wait a few minutes and try again.",
}
const NOTICES: Record<string, string> = {
  signed_out: "You've signed out.",
  password_changed: "Your password was changed. Sign in with the new one.",
  invite_accepted: "Your password is set. Sign in to continue.",
}

export default function LoginPage({ searchParams }: PageProps<"/host/login">) {
  return (
    <AuthShell title="Host on DevEvent" intro="Sign in to list your developer or corporate events, or create a host account.">
      <Suspense fallback={<SessionLoader label="Loading..." />}>
        <LoginContent searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  )
}

async function LoginContent({ searchParams }: Pick<PageProps<"/host/login">, "searchParams">) {
  const params = await searchParams
  const one = (key: string) => (typeof params[key] === "string" ? (params[key] as string) : undefined)
  const next = one("next")

  // Already signed in: go straight on.
  const session = await getSession()
  if (session) redirect(landingFor(session.user, next))

  const errorCode = one("error")
  const error = errorCode === "refused" ? one("message") : errorCode ? ERRORS[errorCode] : undefined
  const notice = NOTICES[one("notice") ?? ""]

  return (
    <>
      {error && <p className="rounded-md border border-red-400/40 px-3 py-2 text-sm text-red-400" role="alert">{error}</p>}
      {notice && <p className="rounded-md border border-green-400/40 px-3 py-2 text-sm text-green-400" role="status">{notice}</p>}
      <OAuthButtons next={next} />
      <LoginForm next={next} />
      <p className="text-light-200 text-center text-sm">
        New to hosting? <Link href="/host/signup" className="text-primary underline">Create a host account</Link>
      </p>
    </>
  )
}
