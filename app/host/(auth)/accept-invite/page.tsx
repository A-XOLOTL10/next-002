import { Suspense } from "react"
import { AuthShell } from "@/components/auth/AuthShell"
import { NewPasswordForm } from "@/components/auth/AuthForms"
import SessionLoader from "@/components/SessionLoader"
import { tokenIsValid } from "@/lib/accounts"

// Where a new supra admin's invite email leads: they choose a password, then sign in and set
// up their authenticator app.
export default function AcceptInvitePage({ searchParams }: PageProps<"/host/accept-invite">) {
  return (
    <Suspense fallback={<SessionLoader label="Checking your invite..." />}>
      <Content searchParams={searchParams} />
    </Suspense>
  )
}

async function Content({ searchParams }: Pick<PageProps<"/host/accept-invite">, "searchParams">) {
  const { token } = await searchParams
  const value = typeof token === "string" ? token : undefined
  if (!(await tokenIsValid("admin_invite", value))) {
    return <AuthShell title="Invite expired" intro="This invite is invalid, expired or already used. Ask for a new one." >{null}</AuthShell>
  }
  return (
    <AuthShell title="Welcome to the team" intro="Choose a password for your account. Next, you'll set up an authenticator app.">
      <NewPasswordForm token={value!} kind="invite" />
    </AuthShell>
  )
}
