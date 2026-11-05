import { notFound } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import ConfirmAction from "@/components/admin/ConfirmAction"
import { requireAdmin } from "@/lib/auth"
import { getHostForReview } from "@/lib/host.service"
import { decideHostAction, recordOrgCheckAction } from "@/lib/actions/console.actions"
import { minutesWaiting } from "@/lib/business-hours"
import { ID_TYPE_LABELS, MAX_CONTACT_ATTEMPTS, type IdType } from "@/database/user.constants"

export const instant = false // a missing host is a real 404, decided before the response starts

const ORG_STYLE: Record<string, string> = { confirmed: "text-green-400", denied: "text-red-400", unreachable: "text-amber-400", pending: "text-light-200" }
const when = (d: Date | string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date(d)) + " WAT"

/** Opens a private document through the admin-only, logged route. */
const DocLink = ({ id, label }: { id: string; label: string }) => (
  <a href={`/api/console/files/${id}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{label}</a>
)

// One host's verification: everything they sent, warning signs, a card per organization to
// record each call, the contact log, and the decision buttons. Every button opens a dialog.
export default async function HostReviewPage({ params }: PageProps<"/host/console/hosts/[id]">) {
  const admin = await requireAdmin()
  const { id } = await params
  const data = await getHostForReview(id)
  if (!data) notFound()
  const { profile: p, user, flags } = data
  const own = user?._id === admin.user.id
  const inReview = p.status === "pending_review" || p.status === "appeal_pending"
  const allConfirmed = p.organizations.length > 0 && p.organizations.every((o) => o.status === "confirmed")
  const anyDenied = p.organizations.some((o) => o.status === "denied")

  return (
    <>
      <AdminNav />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">{p.companyName ?? user?.name ?? "Host"}</h1>
        <p className="text-light-100 text-sm">
          Status: <strong>{p.status.replace("_", " ")}</strong>
          {p.submittedAt && ` · sent ${when(p.submittedAt)} (${minutesWaiting(p.submittedAt)} min ago)`}
          {p.reviewedByName && ` · last decision by ${p.reviewedByName}`}
        </p>
      </div>
      {own && <p className="notice">This is your own host account, so another admin has to review it.</p>}
      {flags.length > 0 && (
        <div className="notice flex flex-col gap-1">
          <p className="font-semibold">Things to check</p>
          {flags.map((f) => <p key={f}>{f}</p>)}
        </div>
      )}

      {p.appeal && (
        <section className="rounded-[10px] border border-amber-400/40 p-4">
          <h2 className="text-lg font-semibold">The host&apos;s response to the denial ({when(p.appeal.submittedAt)})</h2>
          <p className="text-light-100 whitespace-pre-wrap text-sm">{p.appeal.message}</p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">{p.appeal.fileIds.map((f, i) => <DocLink key={f} id={f} label={`Attachment ${i + 1}`} />)}</div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        <Info title="Account">
          <Line label="Name">{user?.name}</Line>
          <Line label="Sign-in email">{user?.email}</Line>
          <Line label="Type">{p.accountType}</Line>
          <Line label="Joined">{user?.createdAt ? when(user.createdAt) : "-"}</Line>
        </Info>
        <Info title="Company">
          <Line label="Name">{p.companyName ?? "-"}</Line>
          <Line label="Registration">{p.companyRegNumber ?? "-"}</Line>
          <Line label="Address">{p.companyAddress ?? "-"}</Line>
          <Line label="Website">{p.website ? <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="underline">{p.website}</a> : "-"}</Line>
          <Line label="Social">{p.socials.length ? p.socials.map((s) => <a key={s} href={s} target="_blank" rel="noopener noreferrer nofollow" className="block underline">{s}</a>) : "-"}</Line>
        </Info>
        <Info title="Main contact">
          <Line label="Name">{p.contactName} {p.contactRole && `(${p.contactRole})`}</Line>
          <Line label="Phone"><a href={`tel:${p.contactPhone}`} className="underline">{p.contactPhone}</a></Line>
          <Line label="Email"><a href={`mailto:${p.contactEmail}`} className="underline">{p.contactEmail}</a></Line>
        </Info>
        <Info title="Documents">
          {p.idDocument ? (
            <Line label="ID">
              {ID_TYPE_LABELS[p.idDocument.type as IdType]} · {p.idDocument.number}
              {p.idDocument.expiresAt && ` · expires ${p.idDocument.expiresAt}`} · <DocLink id={p.idDocument.fileId} label="Open" />
            </Line>
          ) : <Line label="ID">Not uploaded</Line>}
          <Line label="Company">{p.companyDocumentIds.length ? p.companyDocumentIds.map((f, i) => <span key={f} className="mr-3"><DocLink id={f} label={`Document ${i + 1}`} /></span>) : "None"}</Line>
        </Info>
      </section>
      {p.companyDescription && <p className="text-light-100 text-sm"><strong>About:</strong> {p.companyDescription}</p>}

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Organizations to confirm</h2>
        <p className="text-light-200 text-sm">Call or email each one and record what they said. After {MAX_CONTACT_ATTEMPTS} unanswered attempts an organization is marked unreachable; ask the host for another contact.</p>
        {p.organizations.map((o) => (
          <div key={o._id} className="bg-dark-100 border-dark-200 flex flex-col gap-2 rounded-[10px] border p-4">
            <p className="font-semibold">{o.name} <span className="text-light-200 text-sm font-normal">({o.role})</span> · <span className={ORG_STYLE[o.status]}>{o.status}</span></p>
            <p className="text-sm">
              {o.contactName} · <a href={`tel:${o.contactPhone}`} className="underline">{o.contactPhone}</a> · <a href={`mailto:${o.contactEmail}`} className="underline">{o.contactEmail}</a>
              {o.website && <> · <a href={o.website} target="_blank" rel="noopener noreferrer nofollow" className="underline">website</a></>}
            </p>
            {o.attempts > 0 && <p className="text-light-200 text-xs">{o.attempts} unanswered attempt(s)</p>}
            {o.checkedByName && <p className="text-light-200 text-xs">Last recorded by {o.checkedByName}{o.checkedAt && ` on ${when(o.checkedAt)}`}{o.notes && `: "${o.notes}"`}</p>}
            {inReview && !own && (
              <div className="flex flex-wrap gap-2">
                <ConfirmAction action={recordOrgCheckAction.bind(null, p._id, o._id, "confirmed")} label="They confirmed" title={`${o.name} confirmed?`} description="Record that this organization confirmed they know about and support this host's events." confirmLabel="Record confirmation" reason={{ label: "Who did you speak to? (optional)" }} />
                <ConfirmAction action={recordOrgCheckAction.bind(null, p._id, o._id, "denied")} label="They denied it" tone="danger" title={`${o.name} denied the partnership?`} description="Record that this organization said they are NOT involved. You can then deny the host, who will be emailed and may respond once." confirmLabel="Record denial" reason={{ label: "Who did you speak to, and what did they say?", required: true }} />
                <ConfirmAction action={recordOrgCheckAction.bind(null, p._id, o._id, "no_answer")} label="No answer" buttonClassName="border-dark-200 cursor-pointer rounded-[6px] border px-3 py-1.5 text-sm" title="No answer?" description={`Record an unanswered call or email. After ${MAX_CONTACT_ATTEMPTS} attempts the organization is marked unreachable.`} confirmLabel="Record attempt" reason={{ label: "How did you try? (optional)" }} />
                <ConfirmAction action={recordOrgCheckAction.bind(null, p._id, o._id, "note")} label="Add note" buttonClassName="cursor-pointer px-3 py-1.5 text-sm underline" title="Add a note" description="Notes are saved on the request and in the activity log." confirmLabel="Save note" reason={{ label: "Note", required: true }} />
              </div>
            )}
          </div>
        ))}
      </section>

      {p.contactLog.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">Contact log</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {[...p.contactLog].reverse().map((entry, i) => (
              <li key={i} className="list-none">
                <span className="text-light-200">{when(entry.at)}</span> · {entry.byName} · {entry.orgName}: <strong>{entry.outcome.replace("_", " ")}</strong>{entry.notes && ` "${entry.notes}"`}
              </li>
            ))}
          </ul>
        </section>
      )}

      {!own && (
        <section className="flex flex-wrap gap-3 border-t border-dark-200 pt-6">
          {inReview && (
            <>
              <ConfirmAction action={decideHostAction.bind(null, p._id, "approve")} label="Approve host" disabled={!allConfirmed} title="Approve this host?" description="They'll be emailed and can start creating events (each event is still reviewed). Every organization has been confirmed." confirmLabel="Approve" />
              <ConfirmAction action={decideHostAction.bind(null, p._id, "needs_info")} label="Ask for more information" buttonClassName="border-dark-200 cursor-pointer rounded-[6px] border px-3 py-1.5 text-sm font-semibold" title="Ask the host for more information?" description="The host is emailed your note and can edit and resend their details." confirmLabel="Send request" reason={{ label: "What do they need to add or fix? (sent to the host)", required: true }} />
              <ConfirmAction action={decideHostAction.bind(null, p._id, "deny")} label="Deny" tone="danger" disabled={!anyDenied} title="Deny this host?" description={p.status === "appeal_pending" ? "This is their second denial, so it's final: the account is rejected." : "The host is emailed that an organization didn't confirm the partnership, and may respond once."} confirmLabel="Deny" reason={{ label: "Note for the host", required: true }} />
            </>
          )}
          {(inReview || p.status === "denied" || p.status === "needs_info") && (
            <ConfirmAction action={decideHostAction.bind(null, p._id, "reject")} label="Reject for good" tone="danger" title="Reject this host permanently?" description="They can't create events and can't resubmit. They'll be emailed the reason." confirmLabel="Reject" reason={{ label: "Reason (sent to the host)", required: true }} typeToConfirm="REJECT" />
          )}
          {p.status === "approved" && (
            <ConfirmAction action={decideHostAction.bind(null, p._id, "suspend")} label="Suspend host" tone="danger" title="Suspend this host?" description="All their live events are cancelled immediately and everyone who booked is emailed. They'll be emailed the reason." confirmLabel="Suspend" reason={{ label: "Reason (sent to the host)", required: true }} typeToConfirm="SUSPEND" />
          )}
          {p.status === "suspended" && (
            <ConfirmAction action={decideHostAction.bind(null, p._id, "reinstate")} label="Reinstate host" title="Reinstate this host?" description="They can create events again. Events cancelled by the suspension stay cancelled." confirmLabel="Reinstate" reason={{ label: "Why? (for the log)" }} />
          )}
          {inReview && !allConfirmed && <p className="text-light-200 w-full text-xs">Approve unlocks once every organization is confirmed; Deny once one has denied.</p>}
        </section>
      )}
    </>
  )
}

const Info = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-dark-100 border-dark-200 flex flex-col gap-1 rounded-[10px] border p-4 text-sm">
    <h2 className="mb-1 text-base font-semibold">{title}</h2>
    {children}
  </div>
)
const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <p><span className="text-light-200">{label}:</span> {children}</p>
)
