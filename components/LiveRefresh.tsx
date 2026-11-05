"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

const BASE_INTERVAL_MS = 30_000
const MAX_INTERVAL_MS = 5 * 60_000

/**
 * Keeps an event list up to date without a reload. Every ~30 seconds, while the tab is
 * visible, it asks /api/events/version for a tiny fingerprint; if that changed (an event was
 * published, edited or removed), router.refresh() re-renders the list in place, keeping scroll
 * position. Checks pause in background tabs, carry a random offset so open tabs don't all ask
 * at the same second, and back off after errors.
 */
export default function LiveRefresh() {
  const router = useRouter()

  useEffect(() => {
    let known: string | null = null
    let delay = BASE_INTERVAL_MS
    let timer: number | undefined
    let stopped = false

    const check = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/events/version", { cache: "no-store" })
          const { version } = (await res.json()) as { version: string | null }
          if (res.ok && version) {
            if (known !== null && version !== known) router.refresh()
            known = version
            delay = BASE_INTERVAL_MS
          } else {
            delay = Math.min(delay * 2, MAX_INTERVAL_MS)
          }
        } catch {
          delay = Math.min(delay * 2, MAX_INTERVAL_MS) // offline or server busy: ask less often
        }
      }
      if (!stopped) timer = window.setTimeout(check, delay + Math.random() * 5_000)
    }

    // Coming back to the tab checks straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        window.clearTimeout(timer)
        void check()
      }
    }

    timer = window.setTimeout(check, 2_000 + Math.random() * 3_000)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      window.clearTimeout(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router])

  return null
}
