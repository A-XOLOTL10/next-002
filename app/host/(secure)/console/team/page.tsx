import AdminNav from "@/components/admin/AdminNav"
import ConfirmAction from "@/components/admin/ConfirmAction"
import InviteAdminForm from "@/components/admin/InviteAdminForm"
import { requireSuperAdmin } from "@/lib/auth"
import connectDB from "@/lib/mongodb"
import User from "@/database/user.model"
import { resendInviteAction, setAdminStatusAction } from "@/lib/actions/console.actions"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const when = (d?: Date) => (d ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(d) + " WAT" : "Never")

// The admin team. Only the super admin sees this page; supra admins can never change the super
// admin (every action here only matches supra admin accounts).
export default async function TeamPage() {
  await requireSuperAdmin()
  await connectDB()
  const admins = await User.find({ role: { $in: ["super_admin", "supra_admin"] }, status: { $ne: "deleted" } }).sort({ role: -1, createdAt: 1 }).lean()

  return (
    <>
      <AdminNav />
      <div>
        <h1 className="text-3xl font-bold">Team</h1>
        <p className="text-light-100 text-sm">
          Supra admins review hosts and events, publish and check tickets in. They can&apos;t manage the team, read the activity log, or change your account.
        </p>
      </div>

      <InviteAdminForm />

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-dark-200 border-b">
            <tr><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Authenticator</th><th className="py-2 pr-4">Last sign-in</th><th className="py-2" /></tr>
          </thead>
          <tbody>
            {admins.map((a) => {
              const id = a._id.toString()
              const isSuper = a.role === "super_admin"
              return (
                <tr key={id} className="border-dark-200 border-b">
                  <td className="py-2 pr-4">{a.name}<span className="text-light-200 block text-xs">{a.email}</span></td>
                  <td className="py-2 pr-4">{isSuper ? "Super admin" : "Supra admin"}</td>
                  <td className={`py-2 pr-4 ${a.status === "active" ? "text-green-400" : "text-amber-400"}`}>{a.status}</td>
                  <td className="py-2 pr-4">{a.totpEnabledAt ? "On" : <span className="text-amber-400">Not set up</span>}</td>
                  <td className="py-2 pr-4">{when(a.lastLoginAt)}</td>
                  <td className="py-2 text-right">
                    {!isSuper && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {a.status === "invited" && (
                          <ConfirmAction action={resendInviteAction.bind(null, id)} label="Resend invite" buttonClassName="cursor-pointer text-sm underline" title="Resend the invite?" description={`A new 48-hour invite link goes to ${a.email}. The old link stops working.`} confirmLabel="Resend" />
                        )}
                        {a.status === "active" && (
                          <ConfirmAction action={setAdminStatusAction.bind(null, id, "suspend")} label="Suspend" tone="danger" title={`Suspend ${a.name}?`} description="They're signed out everywhere immediately and can't sign in until reactivated." confirmLabel="Suspend" />
                        )}
                        {a.status === "suspended" && (
                          <ConfirmAction action={setAdminStatusAction.bind(null, id, "reactivate")} label="Reactivate" title={`Reactivate ${a.name}?`} description="They can sign in again with their password and authenticator app." confirmLabel="Reactivate" />
                        )}
                        <ConfirmAction action={setAdminStatusAction.bind(null, id, "remove")} label="Remove" tone="danger" title={`Remove ${a.name} from the team?`} description="Their account is closed and they're signed out everywhere. Their past actions stay in the activity log. This can't be undone." confirmLabel="Remove" typeToConfirm="REMOVE" />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
