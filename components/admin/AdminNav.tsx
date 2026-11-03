import Link from "next/link"
import { logout } from "@/lib/actions/admin.actions"

const LINKS = [
  { href: "/admin", label: "Events" },
  { href: "/admin/drafts", label: "Drafts" },
  { href: "/admin/import", label: "AI Import" },
  { href: "/admin/check-in", label: "Check-in" },
]

/** Top bar for admin pages. */
const AdminNav = () => (
  <nav className="border-dark-200 flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm">
    <div className="flex flex-wrap items-center gap-6">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className="font-semibold hover:underline">{label}</Link>
      ))}
    </div>
    <div className="flex items-center gap-6">
      {/* A full page load, not a client-side Link, so the admin always sees the live site
          rather than a copy their browser kept from earlier. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate full reload, see above */}
      <a href="/" className="hover:underline">View visitor site &rarr;</a>
      <form action={logout}>
        <button type="submit" className="cursor-pointer hover:underline">Sign out</button>
      </form>
    </div>
  </nav>
)

export default AdminNav
