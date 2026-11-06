import { useState } from "react"
import { Alert } from "react-native"
import { Redirect, router } from "expo-router"
import { Body, Button, ErrorText, Loading, Screen, Title } from "@/components/ui"
import { useSession } from "@/lib/session"

/** Admin phones open here: the owner's fingerprint, face or passcode unlocks admin access. */
export default function Unlock() {
  const session = useSession()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (session.status === "loading") return <Loading />
  if (session.status === "signed-out") return <Redirect href="/setup" />
  if (!session.locked) return <Redirect href="/scan" />

  const unlock = async () => {
    setBusy(true)
    setError(null)
    const ok = await session.unlock()
    setBusy(false)
    if (ok) router.replace("/scan")
    else setError("Not unlocked. Only the phone's owner can open admin access.")
  }

  const confirmUnlink = () =>
    Alert.alert("Unlink this phone?", "Admin access is removed from this phone. You can link it again from the website.", [
      { text: "Cancel", style: "cancel" },
      { text: "Unlink", style: "destructive", onPress: () => void session.signOut("This phone was unlinked.") },
    ])

  return (
    <Screen>
      <Title>Admin access is locked</Title>
      <Body muted>Signed in as {session.credential?.device.name}. Unlock with this phone&apos;s fingerprint, face or passcode.</Body>
      <Button label="Unlock" onPress={() => void unlock()} busy={busy} />
      <ErrorText message={error} />
      <Button label="Unlink this phone" variant="danger" onPress={confirmUnlink} />
    </Screen>
  )
}
