import { Suspense } from "react"
import Link from "next/link"
import { AuthShell } from "@/components/auth/AuthShell"
import { NewPasswordForm } from "@/components/auth/AuthForms"
import SessionLoader from "@/components/SessionLoader"
import { tokenIsValid } from "@/lib/accounts"

export default function ResetPasswordPage({ searchParams }: PageProps<"/host/reset-password">) {
  return (
    <Suspense fallback={<SessionLoader label="Checking your link..." />}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}

async function Content({ searchParams }: Pick<PageProps<"/host/reset-password">, "searchParams">) {
  const { token } = await searchParams
  const value = typeof token === "string" ? token : undefined
  if (!(await tokenIsValid("password_reset", value))) {
    return (
      <AuthShell title="Link expired" intro="This reset link is invalid, expired or already used.">
        <Link href="/host/forgot-password" className="admin-button text-center">Send a new link</Link>
      </AuthShell>
    )
  }
  return (
    <AuthShell title="Choose a new password" intro="Every device signed in to your account will be signed out.">
      <NewPasswordForm token={value!} kind="reset" />
    </AuthShell>
  )
}
