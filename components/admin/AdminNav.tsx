import Link from "next/link"
import { getSession } from "@/lib/auth"
import { logoutAction } from "@/lib/actions/auth.actions"
import ActivityTracker from "@/components/admin/ActivityTracker"

const LINKS = [
  { href: "/host/console/approvals", label: "Approvals" },
  { href: "/host/console", label: "Events" },
  { href: "/host/console/drafts", label: "Drafts" },
  { href: "/host/console/import", label: "AI Import" },
  { href: "/host/check-in", label: "Check-in" },
  { href: "/host/console/devices", label: "Mobile app" },
  { href: "/host/console/security", label: "Security" },
]

// Only the super admin manages the team and reads the activity log.
const SUPER_LINKS = [
  { href: "/host/console/team", label: "Team" },
  { href: "/host/console/logs", label: "Activity log" },
]

/** Top bar for console pages. Rendered inside the session gate, so the session is already known. */
const AdminNav = async () => {
  const session = await getSession()
  const links = session?.user.role === "super_admin" ? [...LINKS, ...SUPER_LINKS] : LINKS

  return (
    <nav className="border-dark-200 flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm">
      <div className="flex flex-wrap items-center gap-5">
        {links.map(({ href, label }) => (
          <Link key={href} href={href} className="font-semibold hover:underline">{label}</Link>
        ))}
      </div>
      <div className="flex items-center gap-5">
        {session && <span className="text-light-200">{session.user.name}{session.user.role === "super_admin" ? " (super admin)" : ""}</span>}
        {/* A full page load, not a client-side Link, so the admin always sees the live site
            rather than a copy their browser kept from earlier. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate full reload, see above */}
        <a href="/" className="hover:underline">View site &rarr;</a>
        <form action={logoutAction}>
          <button type="submit" className="cursor-pointer hover:underline">Sign out</button>
        </form>
      </div>
      {/* Page views, clicks and active time for the activity log. */}
      <ActivityTracker />
    </nav>
  )
}

export default AdminNav
