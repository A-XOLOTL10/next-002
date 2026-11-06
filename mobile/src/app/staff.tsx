import { useCallback, useEffect, useState } from "react"
import { Alert, RefreshControl, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Body, Button, Card, ErrorText, styles, useGuard } from "@/components/ui"
import { revokeDevice, staffDevices } from "@/lib/api"
import { useSession } from "@/lib/session"
import type { StaffDevice } from "@/lib/types"

const formatTime = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

/** Admin phones: the staff phones for the selected event, and signing a lost one out. */
export default function Staff() {
  const guard = useGuard({ adminOnly: true })
  const session = useSession()
  const [devices, setDevices] = useState<StaffDevice[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const token = session.credential?.token
  const eventId = session.event?.id
  const { explain } = session

  const load = useCallback(async () => {
    if (!token || !eventId) return
    setRefreshing(true)
    try {
      setDevices((await staffDevices(token, eventId)).devices)
      setError(null)
    } catch (e) {
      setError(explain(e))
    } finally {
      setRefreshing(false)
    }
  }, [token, eventId, explain])

  useEffect(() => {
    void load()
  }, [load])

  if (guard) return guard

  const confirmRevoke = (device: StaffDevice) =>
    Alert.alert(`Sign out ${device.name}?`, "That phone stops checking tickets in at once. Tickets it already admitted stay admitted.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () =>
          void revokeDevice(token!, device.id)
            .then(load)
            .catch((e: unknown) => setError(explain(e))),
      },
    ])

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}>
        <Body muted>{session.event?.title}</Body>
        <ErrorText message={error} />
        {devices?.length === 0 && <Body>No staff phones for this event yet.</Body>}
        {devices?.map((d) => (
          <Card key={d.id}>
            <Body style={{ fontWeight: "700" }}>{d.name}</Body>
            <Body muted>{d.deviceName}{d.platform ? ` (${d.platform})` : ""} · pass from {d.issuedBy}</Body>
            <Body muted>Last used {formatTime(d.lastSeenAt)} · until {formatTime(d.expiresAt)}</Body>
            {d.canRevoke && <Button label="Sign out" variant="danger" onPress={() => confirmRevoke(d)} />}
          </Card>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
