import { notFound } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import VipGuestsPanel from "@/components/host/VipGuestsPanel"
import { requireAdmin } from "@/lib/auth"
import { getVipPage } from "@/lib/vip.service"

export const instant = false // a missing event is a real 404, decided before the response starts

/** The VIP list and door tags for any event, for the admin team. */
export default async function AdminVipGuestsPage({ params }: PageProps<"/host/console/events/[slug]/guests">) {
  const session = await requireAdmin()
  const data = await getVipPage(session, (await params).slug)
  if (!data) notFound()
  return (
    <>
      <AdminNav />
      <VipGuestsPanel data={data} />
    </>
  )
}
