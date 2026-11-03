"use client"

import { useSyncExternalStore } from "react"

const TICK_MS = 30_000

const subscribe = (onTick: () => void) => {
  const timer = setInterval(onTick, TICK_MS)
  return () => clearInterval(timer)
}

// Rounded, so the snapshot only changes when a tick is due.
const getSnapshot = () => Math.floor(Date.now() / TICK_MS) * TICK_MS

/**
 * The current time, refreshed every 30 seconds. Returns 0 while rendering on the server and
 * hydrating, so the first browser render matches the cached HTML; then it updates. That's what
 * lets a cached page still turn an event to "Ended" (or remove it) at the right moment.
 */
export const useNow = (): number => useSyncExternalStore(subscribe, getSnapshot, () => 0)
