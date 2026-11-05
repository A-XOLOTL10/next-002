import { Suspense } from "react"
import Link from "next/link"
import { AuthShell } from "@/components/auth/AuthShell"
import { ConfirmEmailButton } from "@/components/auth/AuthForms"
import SessionLoader from "@/components/SessionLoader"
import { tokenIsValid } from "@/lib/accounts"

// Where the "confirm your email" link leads. Confirming takes a button press: email security
// scanners open links automatically, and that alone must not use up the link.
export default function VerifyEmailPage({ searchParams }: PageProps<"/host/verify-email">) {
  return (
    <Suspense fallback={<SessionLoader label="Checking your link..." />}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}

async function Content({ searchParams }: Pick<PageProps<"/host/verify-email">, "searchParams">) {
  const { token } = await searchParams
  const value = typeof token === "string" ? token : undefined

  if (!(await tokenIsValid("email_verify", value))) {
    return (
      <AuthShell title="Link expired" intro="This link is invalid, expired or already used. Sign in and we'll offer to send a new one.">
        <Link href="/host/login" className="admin-button text-center">Go to sign in</Link>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Confirm your email" intro="One click and your host account is ready.">
      <ConfirmEmailButton token={value!} />
    </AuthShell>
  )
}
