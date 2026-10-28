"use client" // Error boundaries must be Client Components

import { useEffect } from "react"
import posthog from "posthog-js"

// Catches runtime errors in any page (e.g. database or API unreachable) and keeps the Navbar/layout intact.
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
    <section className="flex flex-col items-center gap-4 py-20 text-center">
      <h2>Something went wrong</h2>
      <p>We couldn&apos;t load this page. Please try again in a moment.</p>
      <button type="button" onClick={() => retry()} className="bg-primary rounded-[6px] px-4 py-2.5 font-semibold text-black">
        Try again
      </button>
    </section>
  )
}
