import Link from "next/link"
import AdminNav from "@/components/admin/AdminNav"
import { requireAdmin } from "@/lib/auth"
import { getAllHosts } from "@/lib/host.service"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

const STATUS_STYLE: Record<string, string> = { approved: "text-green-400", rejected: "text-red-400", suspended: "text-red-400", denied: "text-red-400" }

/** Every host who has sent their details, most recently updated first. */
export default async function HostsPage() {
  await requireAdmin()
  const hosts = await getAllHosts()
  return (
    <>
      <AdminNav />
      <h1 className="text-3xl font-bold">Hosts</h1>
      {hosts.length === 0 ? (
        <p className="text-light-200">No hosts have sent their details yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-dark-200 border-b"><tr><th className="py-2 pr-4">Host</th><th className="py-2 pr-4">Contact</th><th className="py-2 pr-4">Type</th><th className="py-2">Status</th></tr></thead>
            <tbody>
              {hosts.map((h) => (
                <tr key={h._id} className="border-dark-200 border-b">
                  <td className="py-2 pr-4"><Link href={`/host/console/hosts/${h._id}`} className="font-semibold hover:underline">{h.company ?? h.name}</Link></td>
                  <td className="py-2 pr-4">{h.name} · {h.email}</td>
                  <td className="py-2 pr-4">{h.accountType}</td>
                  <td className={`py-2 font-semibold ${STATUS_STYLE[h.status] ?? "text-amber-400"}`}>{h.status.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
