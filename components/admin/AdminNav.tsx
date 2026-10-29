import Link from "next/link"
import { logout } from "@/lib/actions/admin.actions"

/** Top bar for admin pages: back to the dashboard, view the visitor site, sign out. */
const AdminNav = () => (
  <nav className="border-dark-200 flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm">
    <Link href="/admin" className="font-semibold hover:underline">Admin Dashboard</Link>
    <div className="flex items-center gap-6">
      <Link href="/" className="hover:underline">View visitor site &rarr;</Link>
      <form action={logout}>
        <button type="submit" className="cursor-pointer hover:underline">Sign out</button>
      </form>
    </div>
  </nav>
)

export default AdminNav
