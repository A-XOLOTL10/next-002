import { useEffect, useState } from "react"
import { Redirect, router, useLocalSearchParams } from "expo-router"
import * as Haptics from "expo-haptics"
import QrScanner from "@/components/QrScanner"
import { Body, Button, ErrorText, Loading, Screen } from "@/components/ui"
import { setUp, unlink } from "@/lib/api"
import { confirmOwner, phoneHasLock } from "@/lib/lock"
import { classify } from "@/lib/scan-text"
import { useSession } from "@/lib/session"

/** Scans an admin link code (from the website) or a staff pass, and sets the phone up with it. */
export default function Link() {
  const session = useSession()
  const kind = useLocalSearchParams<{ kind?: string }>().kind === "admin" ? "admin" : "staff"
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasLock, setHasLock] = useState<boolean | null>(kind === "staff" ? true : null)

  // Admin access must sit behind the phone's own lock.
  useEffect(() => {
    if (kind === "admin") void phoneHasLock().then(setHasLock)
  }, [kind])

  if (session.status === "loading" || hasLock === null) return <Loading />
  if (session.status === "ready") return <Redirect href="/" />

  if (!hasLock) {
    return (
      <Screen>
        <Body>
          Set a screen lock (passcode, fingerprint or face) on this phone first. Admin access is only allowed on a phone that locks, so nobody else can
          use it if it&apos;s lost or left on a desk.
        </Body>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    )
  }

  const handleScan = async (data: string) => {
    const scanned = classify(data)
    if (scanned.type !== "setup") {
      setError(scanned.type === "ticket" ? "That's a visitor's ticket. Scan the setup code first." : "That isn't a DevEvent setup code.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }
    if (scanned.kind !== kind) {
      setError(kind === "admin" ? "That's a staff pass, not an admin link code. Go back and choose \"I'm door staff\"." : "That's an admin link code. Admin phones can't be staff phones: go back and choose \"I'm an admin\" if this is your phone.")
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      return
    }

    setBusy(true)
    setError(null)
    try {
      const credential = await setUp(scanned.code)
      if (credential.device.kind === "admin" && !(await confirmOwner("Confirm this is your phone"))) {
        // Not confirmed by the phone's owner: undo the link straight away.
        await unlink(credential.token).catch(() => undefined)
        setError("Linking was cancelled. Make a new code on the website to try again.")
        return
      }
      await session.completeSetup(credential)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      router.replace("/scan")
    } catch (e) {
      setError(session.explain(e))
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Body muted>
        {kind === "admin"
          ? "Scan the code on the website's Mobile app page (Console, then Mobile app). It works once and only for 5 minutes."
          : "Scan the staff pass your admin shows you. It works once and only for 10 minutes."}
      </Body>
      <QrScanner onScan={(data) => void handleScan(data)} paused={busy} hint={busy ? "Setting up..." : "Point at the setup code"} />
      <ErrorText message={error} />
    </Screen>
  )
}
