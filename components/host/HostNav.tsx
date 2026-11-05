import Link from "next/link"
import { getSession } from "@/lib/auth"
import { logoutAction } from "@/lib/actions/auth.actions"
import { isAdminRole } from "@/database/user.constants"
import AdminNav from "@/components/admin/AdminNav"

const LINKS = [
  { href: "/host", label: "Dashboard" },
  { href: "/host/events/new", label: "New event" },
  { href: "/host/verification", label: "Verification" },
  { href: "/host/check-in", label: "Check-in" },
  { href: "/host/settings", label: "Settings" },
  { href: "/host/welcome", label: "How it works" },
]

/** Top bar for host pages. */
export const HostNav = async () => {
  const session = await getSession()
  return (
    <nav className="border-dark-200 flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm">
      <div className="flex flex-wrap items-center gap-5">
        {LINKS.map(({ href, label }) => (
          <Link key={href} href={href} className="font-semibold hover:underline">{label}</Link>
        ))}
      </div>
      <div className="flex items-center gap-5">
        {session && <span className="text-light-200">{session.user.name}</span>}
        <form action={logoutAction}>
          <button type="submit" className="cursor-pointer hover:underline">Sign out</button>
        </form>
      </div>
    </nav>
  )
}

/** For pages shared by hosts and admins (check-in): the right menu for whoever is signed in. */
export const StaffNav = async () => {
  const session = await getSession()
  return session && isAdminRole(session.user.role) ? <AdminNav /> : <HostNav />
}

export default HostNav
