import { notFound } from "next/navigation"
import HostNav from "@/components/host/HostNav"
import VipGuestsPanel from "@/components/host/VipGuestsPanel"
import { requireHost } from "@/lib/auth"
import { getVipPage } from "@/lib/vip.service"

// Waits for its data (instant = false), so an event that isn't this host's is a real 404.
export const instant = false

/** A host's VIP list and door tags for one of their events. */
export default async function HostVipGuestsPage({ params }: PageProps<"/host/events/[slug]/guests">) {
  const session = await requireHost()
  const data = await getVipPage(session, (await params).slug)
  if (!data) notFound()
  return (
    <>
      <HostNav />
      <VipGuestsPanel data={data} />
    </>
  )
}
