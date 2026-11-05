"use client"

import Link, { useLinkStatus } from "next/link"
import type { ComponentProps } from "react"

/** A thin bar under the link while its page loads: instant feedback that the click registered. */
function PendingBar() {
  const { pending } = useLinkStatus()
  return <span aria-hidden className={`nav-pending ${pending ? "is-pending" : ""}`} />
}

/** Navbar link with a loading indicator. Costs nothing until clicked (no extra requests). */
const NavLink = ({ children, ...props }: ComponentProps<typeof Link>) => (
  <Link {...props} className="relative">
    {children}
    <PendingBar />
  </Link>
)

export default NavLink
