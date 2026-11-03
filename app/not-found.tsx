import type { Metadata } from "next"
import Link from "next/link"
import RedirectCountdown from "@/components/RedirectCountdown"

export const metadata: Metadata = {
  title: "Page not found | DevEvent",
  robots: { index: false, follow: false },
}

// Shown for unknown addresses, and for events that are drafts or past their last day.
export default function NotFound() {
  return (
    <section className="flex-center min-h-[60vh] flex-col gap-5 py-20 text-center">
      <p className="text-primary font-mono text-7xl font-bold max-sm:text-5xl">404</p>
      <h1 className="text-3xl font-bold">Page not found</h1>
      <p className="text-light-100 max-w-md">
        This page doesn&apos;t exist, or the event has finished and is no longer listed.
      </p>
      <Link href="/events" className="admin-button">Browse events</Link>
      <RedirectCountdown href="/events" label="the events page" />
    </section>
  )
}
