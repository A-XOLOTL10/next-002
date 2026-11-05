import { Suspense } from "react"
import Link from "next/link"
import { AuthShell } from "@/components/auth/AuthShell"
import { ChallengeForm } from "@/components/auth/AuthForms"
import SessionLoader from "@/components/SessionLoader"
import { getPendingChallenge } from "@/lib/auth"

// The extra step after a correct password for team accounts: the authenticator app code, and,
// on a new device or from a new country, a code sent by email.
export default function VerifySignInPage() {
  return (
    <Suspense fallback={<SessionLoader label="Loading..." />}>
      <Challenge />
    </Suspense>
  )
}

async function Challenge() {
  const challenge = await getPendingChallenge()
  if (!challenge) {
    return (
      <AuthShell title="Sign-in expired" intro="This sign-in has expired or was already completed.">
        <Link href="/host/login" className="admin-button text-center">Sign in again</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Confirm it's you"
      intro={
        challenge.step === "email"
          ? `This is a new device or place for your account, so we've emailed a 6-digit code to ${challenge.email}. It expires in 10 minutes.`
          : "Enter the 6-digit code from your authenticator app."
      }
    >
      {/* key: a fresh, empty form for each step */}
      <ChallengeForm key={challenge.step} step={challenge.step} />
    </AuthShell>
  )
}
