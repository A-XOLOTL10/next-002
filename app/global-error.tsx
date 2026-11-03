'use client'

import posthog from 'posthog-js'
import { useEffect } from 'react'

// Only shows if the root layout itself fails. It replaces the whole document and doesn't get
// the site's stylesheet, so it carries its own styles.
export default function GlobalError({
  error,
  retry,
}: Readonly<{
  error: Error & { digest?: string }
  retry: () => void
}>) {
  useEffect(() => {
    if (
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
      process.env.NEXT_PUBLIC_POSTHOG_HOST
    ) {
      posthog.captureException(error)
    }
  }, [error])

  return (
    <html lang="en">
      <head>
        <title>Something went wrong | DevEvent</title>
      </head>
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#030708', color: '#e7f2ff', fontFamily: 'Arial, sans-serif', textAlign: 'center', padding: 24 }}>
        <main>
          <h1 style={{ fontSize: 32, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: '#bdbdbd', marginBottom: 24 }}>DevEvent couldn&apos;t load. Please try again in a moment.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ background: '#59deca', color: '#000', border: 0, borderRadius: 6, padding: '12px 20px', fontWeight: 700, cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
