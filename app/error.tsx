"use client" // Error boundaries must be Client Components

import { useEffect } from "react"
import Link from "next/link"
import posthog from "posthog-js"

// Catches runtime errors in any page (e.g. database or API unreachable) and keeps the
// Navbar/layout intact. No automatic redirect here: unlike a 404, trying again often works.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
    if (process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST) {
      posthog.captureException(error)
    }
  }, [error])

  return (
    <section className="flex-center min-h-[60vh] flex-col gap-5 py-20 text-center">
      <p className="text-primary font-mono text-5xl font-bold">Oops</p>
      <h1 className="text-3xl font-bold">Something went wrong</h1>
      <p className="text-light-100 max-w-md">
        We couldn&apos;t load this page. This is usually temporary, so please try again in a moment.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="admin-button">Try again</button>
        <Link href="/events" className="border-dark-200 rounded-[6px] border px-4 py-2.5 font-semibold">Browse events</Link>
      </div>
      {error.digest && <p className="text-light-200 font-mono text-xs">Reference: {error.digest}</p>}
    </section>
  )
}
