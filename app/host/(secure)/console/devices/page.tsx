import AdminNav from "@/components/admin/AdminNav"
import ConfirmAction from "@/components/admin/ConfirmAction"
import { LinkPhoneForm, StaffPassForm } from "@/components/admin/ScannerSetup"
import { actorOf, requireAdmin } from "@/lib/auth"
import { listDevices, liveEventsForScanning } from "@/lib/scanner"
import { revokeAllStaffAction, revokeDeviceAction } from "@/lib/actions/scanner.actions"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const formatWhen = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(iso))

/**
 * Console > Mobile app: link an admin's own phone to the DevEvent Scanner app, hand out staff
 * passes for door staff, and see or unlink every phone that can check tickets in.
 */
export default async function ScannerDevicesPage() {
  const session = await requireAdmin()
  const [devices, events] = await Promise.all([listDevices(actorOf(session)!), liveEventsForScanning()])
  const adminPhones = devices.filter((d) => d.kind === "admin")
  const staffPhones = devices.filter((d) => d.kind === "staff")

  return (
    <>
      <AdminNav />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Mobile app</h1>
        <p className="text-light-100 max-w-3xl text-sm">
          The DevEvent Scanner app checks visitors in at the door: it scans ticket QR codes (or takes a typed DEV- ticket ID) and shows at once whether
          the guest is VIP or regular and which tag to give them. Bookings still happen on this website.
        </p>
      </div>

      <section className="bg-dark-100 border-dark-200 flex flex-col gap-3 rounded-[10px] border p-4">
        <h2 className="text-xl font-semibold">1. Link your own phone</h2>
        <p className="text-light-200 text-sm">
          Your phone gets your admin access in the app: any live event, and it can hand out staff passes. It&apos;s protected by your phone&apos;s
          fingerprint, face or passcode, lasts 30 days, and you (and the super admin) are emailed when it&apos;s linked. Never hand this phone to door
          staff: give them a staff pass instead.
        </p>
        <LinkPhoneForm />
      </section>

      <section className="bg-dark-100 border-dark-200 flex flex-col gap-3 rounded-[10px] border p-4">
        <h2 className="text-xl font-semibold">2. Give door staff a pass</h2>
        <p className="text-light-200 text-sm">
          A staff pass turns a staff member&apos;s phone into a scanner for <strong>one event</strong>. It isn&apos;t an account: there&apos;s no
          password, email or setting on it, it can only look up and admit tickets, and it shows guests&apos; emails partly hidden. It stops working when
          it runs out, when you unlink it below, or if the admin who made it loses access. A phone that&apos;s linked to an admin can&apos;t use a
          staff pass. You can also make passes from your linked phone in the app.
        </p>
        <StaffPassForm events={events} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Linked phones</h2>
          {staffPhones.length > 0 && (
            <ConfirmAction
              action={revokeAllStaffAction}
              label="Sign out all staff phones"
              tone="danger"
              title="Sign out every staff phone?"
              description="Every staff phone, for every event, stops working immediately. Admin phones stay linked. Staff will need new passes."
              confirmLabel="Sign them all out"
            />
          )}
        </div>
        {devices.length === 0 ? (
          <p className="text-light-200 text-sm">No phones are linked.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-dark-200 border-b">
                <tr>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Who</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">Last used</th>
                  <th className="py-2 pr-4">Works until</th>
                  <th className="py-2 text-right">Unlink</th>
                </tr>
              </thead>
              <tbody>
                {[...adminPhones, ...staffPhones].map((d) => (
                  <tr key={d.id} className="border-dark-200 border-b align-top">
                    <td className="py-2 pr-4">{d.kind === "admin" ? <span className="text-primary font-semibold">Admin</span> : "Staff"}</td>
                    <td className="py-2 pr-4">
                      {d.name}
                      {d.issuedBy && <span className="text-light-200 block text-xs">pass from {d.issuedBy}</span>}
                    </td>
                    <td className="py-2 pr-4">{d.deviceName}{d.platform ? ` (${d.platform})` : ""}</td>
                    <td className="py-2 pr-4">{d.kind === "admin" ? "Any live event" : (d.eventTitle ?? "—")}</td>
                    <td className="py-2 pr-4">{formatWhen(d.lastSeenAt)}</td>
                    <td className="py-2 pr-4">{formatWhen(d.expiresAt)}</td>
                    <td className="py-2 text-right">
                      {d.canRevoke && (
                        <ConfirmAction
                          action={revokeDeviceAction.bind(null, d.id)}
                          label="Unlink"
                          tone="danger"
                          title={`Unlink ${d.kind === "admin" ? `${d.name}'s phone` : `${d.name}'s staff phone`}?`}
                          description="The app on that phone stops working at its next scan and goes back to the setup screen. Tickets it already admitted stay admitted."
                          confirmLabel="Unlink"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-light-200 text-xs">Times are West Africa Time.</p>
      </section>
    </>
  )
}
