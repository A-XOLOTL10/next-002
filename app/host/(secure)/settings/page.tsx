import HostNav from "@/components/host/HostNav"
import AccountSettings from "@/components/account/AccountSettings"
import ConfirmAction from "@/components/admin/ConfirmAction"
import PasswordInput from "@/components/auth/PasswordInput"
import { requireHost } from "@/lib/auth"
import { getMySessions } from "@/lib/session-data"
import { deleteAccountAction } from "@/lib/actions/host.actions"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

export default async function HostSettingsPage() {
  const session = await requireHost()
  const sessions = await getMySessions(session.user.id, session.sessionId)

  return (
    <>
      <HostNav />
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-light-100 text-sm">Signed in as {session.user.email}</p>

      <AccountSettings sessions={sessions} hasPassword={session.user.hasPassword} />

      <section className="flex flex-col gap-3 rounded-[10px] border border-red-400/30 p-5">
        <h2 className="text-xl font-semibold text-red-400">Close your host account</h2>
        <p className="text-light-100 text-sm">
          Your live events are cancelled and everyone who booked is emailed. Your personal details are removed from the account
          straight away; verification documents are kept for 12 months in case of a dispute, then deleted.
        </p>
        <div>
          <ConfirmAction
            action={deleteAccountAction}
            label="Close my account"
            tone="danger"
            title="Close your account for good?"
            description="This cancels your live events (attendees are emailed) and signs you out everywhere. It can't be undone."
            confirmLabel="Close my account"
            typeToConfirm="DELETE"
          >
            {session.user.hasPassword && (
              <label className="flex flex-col gap-2 text-sm">
                <span className="font-semibold">Your password</span>
                <PasswordInput name="password" autoComplete="current-password" required />
              </label>
            )}
          </ConfirmAction>
        </div>
      </section>
    </>
  )
}
