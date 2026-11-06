"use client"

import { useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"

// Top-level pages have nowhere to go back to.
const HIDDEN = new Set(["/", "/host", "/host/console"])

// Fallback for browsers without the Navigation API: count route changes since the site loaded.
let lastPath: string | null = null
let navigationsInSite = 0

/** Where "Back" goes when there's no earlier page on this site (opened from an email or a bookmark). */
function parentOf(pathname: string): string {
  if (pathname.startsWith("/host/console/")) return "/host/console"
  if (pathname.startsWith("/host/")) return "/host"
  if (pathname.startsWith("/events/")) return "/events"
  return "/"
}

type NavigationApi = { canGoBack?: boolean }

/**
 * "← Back" on every page below the top level. Goes back in history when the previous page was
 * on this site; otherwise to the section's main page, so it never sends anyone off the site.
 */
export default function BackButton() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) navigationsInSite++
    lastPath = pathname
  }, [pathname])

  if (HIDDEN.has(pathname)) return null

  const goBack = () => {
    // navigation.canGoBack only counts this site's own history entries.
    const navigation = (window as unknown as { navigation?: NavigationApi }).navigation
    const canGoBack = typeof navigation?.canGoBack === "boolean" ? navigation.canGoBack : navigationsInSite > 0
    if (canGoBack) router.back()
    else router.push(parentOf(pathname))
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className="text-light-100 hover:text-primary mb-6 flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold"
    >
      <span aria-hidden="true">&larr;</span> Back
    </button>
  )
}
