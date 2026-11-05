"use client"

import { useEffect, useRef } from "react"
import { usePathname } from "next/navigation"

type ActivityEvent =
  | { type: "page"; path: string; at: number }
  | { type: "click"; path: string; label: string; at: number }
  | { type: "active"; seconds: number; at: number }

const FLUSH_EVERY_MS = 20_000
const HEARTBEAT_MS = 60_000
const IDLE_AFTER_MS = 2 * 60_000

/**
 * Feeds the activity log from the console: pages opened, buttons and links clicked, and active
 * time (counted only while the tab is visible and someone moved the mouse or typed in the last
 * 2 minutes). Events are batched and sent with sendBeacon, which doesn't slow the page and
 * still delivers when the tab closes. Server actions log the important things themselves; this
 * only adds the browsing trail.
 */
export default function ActivityTracker() {
  const pathname = usePathname()
  const queue = useRef<ActivityEvent[]>([])
  const lastInput = useRef(0) // set when the tracker starts (reading the clock during render isn't allowed)

  // Page views (including client-side navigation between console pages).
  useEffect(() => {
    queue.current.push({ type: "page", path: pathname, at: Date.now() })
  }, [pathname])

  useEffect(() => {
    lastInput.current = Date.now()
    const flush = () => {
      if (queue.current.length === 0) return
      const batch = queue.current.splice(0, 50)
      const body = JSON.stringify({ events: batch })
      // sendBeacon survives page unloads; fetch with keepalive is the fallback.
      if (!navigator.sendBeacon?.("/api/console/activity", new Blob([body], { type: "application/json" }))) {
        fetch("/api/console/activity", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {})
      }
    }

    const onClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement | null)?.closest("button, a")
      if (!target) return
      const label = (target.getAttribute("aria-label") || target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60)
      if (label) queue.current.push({ type: "click", path: window.location.pathname, label, at: Date.now() })
    }
    const onInput = () => {
      lastInput.current = Date.now()
    }
    const onHide = () => {
      if (document.visibilityState === "hidden") flush()
    }

    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastInput.current < IDLE_AFTER_MS) {
        queue.current.push({ type: "active", seconds: HEARTBEAT_MS / 1000, at: Date.now() })
      }
    }, HEARTBEAT_MS)
    const flusher = window.setInterval(flush, FLUSH_EVERY_MS)

    document.addEventListener("click", onClick, { capture: true, passive: true })
    window.addEventListener("pointermove", onInput, { passive: true })
    window.addEventListener("keydown", onInput, { passive: true })
    document.addEventListener("visibilitychange", onHide)
    return () => {
      flush()
      window.clearInterval(heartbeat)
      window.clearInterval(flusher)
      document.removeEventListener("click", onClick, { capture: true })
      window.removeEventListener("pointermove", onInput)
      window.removeEventListener("keydown", onInput)
      document.removeEventListener("visibilitychange", onHide)
    }
  }, [])

  return null
}
