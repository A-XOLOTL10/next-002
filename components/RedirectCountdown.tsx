"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

/** Shows a short countdown, then sends the visitor to `href`. */
const RedirectCountdown = ({ href, label, seconds = 6 }: { href: string; label: string; seconds?: number }) => {
  const router = useRouter()
  const [remaining, setRemaining] = useState(seconds)

  useEffect(() => {
    if (remaining <= 0) {
      router.replace(href)
      return
    }
    const timer = setTimeout(() => setRemaining(remaining - 1), 1000)
    return () => clearTimeout(timer)
  }, [remaining, href, router])

  return <p className="text-light-200 text-sm">Taking you to {label} in {remaining}...</p>
}

export default RedirectCountdown
