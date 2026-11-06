import ConfirmAction from "@/components/admin/ConfirmAction"
import { AddVipForm, DoorTagsForm } from "@/components/host/VipForms"
import { addVipGuestsAction, removeVipGuestAction, saveDoorTagsAction } from "@/lib/actions/vip.actions"
import type { VipPageData } from "@/lib/vip.service"

const formatWhen = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso)) + " UTC"

/** The VIP list and door tags for one event. Used on the host's page and in the admin console. */
export default function VipGuestsPanel({ data }: { data: VipPageData }) {
  const { event, guests, tags, stats } = data
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">VIP guests and door tags</h1>
        <p className="text-light-100 text-sm">
          {event.title} · {event.date} · {event.location} · {stats.tickets} ticket(s), {stats.vip} VIP, {stats.checkedIn} checked in
        </p>
      </div>

      {!event.running && (
        <p className="notice">
          {event.status === "published" ? "This event is over, so the VIP list is closed." : "You can add VIP guests once the event is live (approved and published)."}
        </p>
      )}

      <section className="bg-dark-100 border-dark-200 flex flex-col gap-4 rounded-[10px] border p-4">
        <h2 className="text-xl font-semibold">Door tags</h2>
        <p className="text-light-200 text-sm">
          What your door staff hand out after scanning. The scanner app shows this in large text with every ticket, so VIP and regular guests get
          the right wristband or badge.
        </p>
        <DoorTagsForm action={saveDoorTagsAction.bind(null, event.slug)} initial={tags} />
      </section>

      <section className="bg-dark-100 border-dark-200 flex flex-col gap-4 rounded-[10px] border p-4">
        <AddVipForm action={addVipGuestsAction.bind(null, event.slug)} disabled={!event.running} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">VIP list ({guests.length})</h2>
        {guests.length === 0 ? (
          <p className="text-light-200 text-sm">Nobody on the VIP list yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-dark-200 border-b">
                <tr>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Ticket</th>
                  <th className="py-2 pr-4">Checked in</th>
                  <th className="py-2 pr-4">Added by</th>
                  <th className="py-2 text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((guest) => (
                  <tr key={guest.email} className="border-dark-200 border-b align-top">
                    <td className="py-2 pr-4">{guest.email}</td>
                    <td className="py-2 pr-4 font-mono">{guest.ticketId ?? "—"}</td>
                    <td className="py-2 pr-4">{guest.checkedInAt ? formatWhen(guest.checkedInAt) : "—"}</td>
                    <td className="text-light-200 py-2 pr-4">{guest.addedByName}</td>
                    <td className="py-2 text-right">
                      {!guest.checkedInAt && (
                        <ConfirmAction
                          action={removeVipGuestAction.bind(null, event.slug, guest.email)}
                          label="Remove"
                          tone="danger"
                          title={`Remove ${guest.email}?`}
                          description="If they only had a ticket because of this VIP invite, the ticket is cancelled and its QR code stops working. If they booked themselves, they keep a regular ticket. They aren't emailed."
                          confirmLabel="Remove"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
