import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AppState } from "react-native"
import { ApiError, fetchMe, unlink } from "@/lib/api"
import { confirmOwner } from "@/lib/lock"
import { clearCredential, loadCredential, saveCredential } from "@/lib/storage"
import type { Credential, ScannerEvent } from "@/lib/types"

// The phone's state, shared by every screen: its credential, the events it can check in, which
// event is selected, and (admin phones only) whether admin access is unlocked.
//
// Admin phones lock when the app starts and after a minute in the background; unlocking takes
// the phone owner's fingerprint, face or passcode. Staff phones never lock: they only scan.

const RELOCK_AFTER_MS = 60 * 1000

type Session = {
  status: "loading" | "signed-out" | "ready"
  credential: Credential | null
  events: ScannerEvent[]
  event: ScannerEvent | null
  locked: boolean
  /** Why the phone was signed out, shown on the setup screen. */
  notice: string | null
  selectEvent: (id: string) => void
  refresh: () => Promise<void>
  completeSetup: (credential: Credential) => Promise<void>
  unlock: () => Promise<boolean>
  lock: () => void
  /** Forgets the credential here, and tells the server too when it can. */
  signOut: (notice?: string) => Promise<void>
  /** Turns an error into a message; a rejected phone is signed out on the spot. */
  explain: (error: unknown) => string
}

const SessionContext = createContext<Session | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session["status"]>("loading")
  const [credential, setCredential] = useState<Credential | null>(null)
  const [events, setEvents] = useState<ScannerEvent[]>([])
  const [eventId, setEventId] = useState<string | null>(null)
  const [locked, setLocked] = useState(true)
  const [notice, setNotice] = useState<string | null>(null)
  const backgroundedAt = useRef<number | null>(null)

  const forget = useCallback(async (message?: string) => {
    await clearCredential()
    setCredential(null)
    setEvents([])
    setEventId(null)
    setLocked(true)
    setNotice(message ?? null)
    setStatus("signed-out")
  }, [])

  const explain = useCallback(
    (error: unknown): string => {
      if (error instanceof ApiError) {
        if (error.signedOut) void forget(error.message)
        return error.message
      }
      return "Something went wrong. Try again."
    },
    [forget],
  )

  const load = useCallback(
    async (current: Credential) => {
      const me = await fetchMe(current.token)
      setEvents(me.events)
      setEventId((selected) => (selected && me.events.some((e) => e.id === selected) ? selected : (me.events[0]?.id ?? null)))
      const updated = { token: current.token, device: me.device }
      setCredential(updated)
      await saveCredential(updated)
    },
    [],
  )

  // Start-up: read the saved credential and check it with the server.
  useEffect(() => {
    void (async () => {
      const saved = await loadCredential()
      if (!saved || new Date(saved.device.expiresAt).getTime() <= Date.now()) {
        if (saved) await clearCredential()
        setNotice(saved ? "This phone's access ran out. Set it up again." : null)
        setStatus("signed-out")
        return
      }
      setCredential(saved)
      setLocked(saved.device.kind === "admin")
      setStatus("ready")
      try {
        await load(saved)
      } catch (e) {
        // Offline at start-up: keep the saved details; scanning will retry the connection.
        if (e instanceof ApiError && e.signedOut) await forget(e.message)
      }
    })()
  }, [load, forget])

  // Admin phones lock again after a minute in the background.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        backgroundedAt.current ??= Date.now()
      } else if (state === "active") {
        if (backgroundedAt.current && Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true)
        backgroundedAt.current = null
      }
    })
    return () => subscription.remove()
  }, [])

  const value = useMemo<Session>(
    () => ({
      status,
      credential,
      events,
      event: events.find((e) => e.id === eventId) ?? null,
      locked: credential?.device.kind === "admin" && locked,
      notice,
      selectEvent: setEventId,
      refresh: async () => {
        if (!credential) return
        try {
          await load(credential)
        } catch (e) {
          explain(e)
          throw e
        }
      },
      completeSetup: async (next) => {
        await saveCredential(next)
        setCredential(next)
        setNotice(null)
        // The admin just proved they own the phone (see the link screen), so it starts unlocked.
        setLocked(false)
        setStatus("ready")
        await load(next).catch(() => undefined)
      },
      unlock: async () => {
        const ok = await confirmOwner("Unlock DevEvent admin access")
        if (ok) setLocked(false)
        return ok
      },
      lock: () => setLocked(true),
      signOut: async (message) => {
        if (credential) await unlink(credential.token).catch(() => undefined)
        await forget(message)
      },
      explain,
    }),
    [status, credential, events, eventId, locked, notice, load, explain, forget],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error("useSession must be used inside SessionProvider")
  return session
}
