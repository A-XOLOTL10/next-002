import AdminNav from "@/components/admin/AdminNav"
import AccountSettings from "@/components/account/AccountSettings"
import { RegenerateBackupCodes, TotpSetup } from "@/components/admin/TotpSetup"
import { requireAdmin } from "@/lib/auth"
import { getMySessions } from "@/lib/session-data"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

// The admin's own security: authenticator app (required before using the console), password and
// signed-in devices. Admins who still need to set something up are sent here by requireAdmin().
export default async function SecurityPage() {
  const session = await requireAdmin({ setupPage: true })
  const sessions = await getMySessions(session.user.id, session.sessionId)
  const { totpEnabled, mustChangePassword } = session.user

  return (
    <>
      <AdminNav />
      <h1 className="text-3xl font-bold">Security</h1>

      {(!totpEnabled || mustChangePassword) && (
        <p className="notice">
          Before using the console: {[!totpEnabled && "set up your authenticator app", mustChangePassword && "choose a new password of at least 12 characters"].filter(Boolean).join(" and ")}.
        </p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Authenticator app</h2>
        {totpEnabled ? (
          <>
            <p className="text-green-400 text-sm">On. You enter a code from your app every time you sign in.</p>
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold">Lost your backup codes? Make new ones</summary>
              <div className="pt-3"><RegenerateBackupCodes /></div>
            </details>
          </>
        ) : (
          <TotpSetup />
        )}
      </section>

      <AccountSettings sessions={sessions} hasPassword={session.user.hasPassword} />
    </>
  )
}
