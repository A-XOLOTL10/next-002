import Link from "next/link"
import HostNav from "@/components/host/HostNav"
import HostEventForm from "@/components/host/HostEventForm"
import { requireHost } from "@/lib/auth"
import { saveHostEventAction } from "@/lib/actions/host.actions"
import { getHostFormContext } from "@/lib/host-form-data"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

export default async function NewHostEventPage() {
  const session = await requireHost()
  const context = await getHostFormContext(session.user.id, session.user)

  return (
    <>
      <HostNav />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Create an event</h1>
        <p className="text-light-100 text-sm">Save a draft any time. When everything&apos;s ready, send it for review; it goes live once our team approves it.</p>
      </div>
      {context.approved ? (
        <HostEventForm action={saveHostEventAction.bind(null, null)} sponsors={context.sponsors} aiEnabled={context.aiEnabled} mode="new" defaultContact={context.defaultContact} />
      ) : (
        <p className="notice">
          You can create events once your host account is verified. <Link href="/host/verification" className="underline">Go to verification</Link>
        </p>
      )}
    </>
  )
}
