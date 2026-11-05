import ConfirmAction from "@/components/admin/ConfirmAction"
import ChangePasswordForm from "@/components/account/ChangePasswordForm"
import { revokeSessionAction, signOutOtherSessionsAction } from "@/lib/actions/host.actions"
import type { SessionRow } from "@/lib/session-data"

const when = (iso: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(iso)) + " WAT"

/** Password and signed-in devices: shared by the host settings page and the console security page. */
export default function AccountSettings({ sessions, hasPassword }: { sessions: SessionRow[]; hasPassword: boolean }) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">{hasPassword ? "Change password" : "Add a password"}</h2>
        {!hasPassword && <p className="text-light-200 text-sm">You sign in with Google or GitHub. Adding a password gives you another way in.</p>}
        <ChangePasswordForm hasPassword={hasPassword} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Where you&apos;re signed in</h2>
          {sessions.length > 1 && (
            <ConfirmAction
              action={signOutOtherSessionsAction}
              label="Sign out everywhere else"
              title="Sign out all other devices?"
              description="Every other browser signed in to your account is signed out straight away. This one stays signed in."
              confirmLabel="Sign them out"
              tone="danger"
            />
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-dark-200 border-b">
              <tr><th className="py-2 pr-4">Device</th><th className="py-2 pr-4">Location</th><th className="py-2 pr-4">Signed in</th><th className="py-2 pr-4">Last active</th><th className="py-2" /></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="border-dark-200 border-b">
                  <td className="py-2 pr-4">{s.device}{s.current && <span className="text-primary"> (this device)</span>}</td>
                  <td className="py-2 pr-4">{s.place} <span className="text-light-200 text-xs">{s.ip}</span></td>
                  <td className="py-2 pr-4">{when(s.createdAt)}</td>
                  <td className="py-2 pr-4">{when(s.lastSeenAt)}</td>
                  <td className="py-2 text-right">
                    {!s.current && (
                      <ConfirmAction
                        action={revokeSessionAction.bind(null, s.id)}
                        label="Sign out"
                        title="Sign out this device?"
                        description={`${s.device} in ${s.place} will be signed out straight away.`}
                        confirmLabel="Sign out"
                        tone="danger"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
