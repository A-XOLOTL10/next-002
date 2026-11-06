import { useEffect, useState } from "react"
import { Image, Pressable, Text, TextInput, View } from "react-native"
import { Body, Button, Card, ErrorText, Screen, styles, useGuard } from "@/components/ui"
import { createPass } from "@/lib/api"
import { confirmOwner } from "@/lib/lock"
import { useSession } from "@/lib/session"
import type { StaffPass } from "@/lib/types"
import { colors } from "@/theme"

const DURATIONS = [
  { hours: 0, label: "Until it ends" },
  { hours: 4, label: "4 hours" },
  { hours: 8, label: "8 hours" },
  { hours: 12, label: "12 hours" },
]

/** "4:59 left", ticking. */
function useTimeLeft(expiresAt?: string): string | null {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!expiresAt) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [expiresAt])
  if (!expiresAt) return null
  const left = new Date(expiresAt).getTime() - now
  return left > 0 ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} left` : null
}

/**
 * Admin phones: a one-time staff pass for the selected event. The staff member scans it with
 * THEIR phone, which then checks in this event only. Asks for the owner's fingerprint, face
 * or passcode first, so only the admin can hand out access.
 */
export default function Pass() {
  const guard = useGuard({ adminOnly: true })
  const session = useSession()
  const [label, setLabel] = useState("")
  const [hours, setHours] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pass, setPass] = useState<StaffPass | null>(null)
  const left = useTimeLeft(pass?.expiresAt)

  if (guard) return guard
  const event = session.event

  const make = async () => {
    if (!event || !session.credential) return
    setError(null)
    if (!(await confirmOwner("Confirm to make a staff pass"))) return setError("Not confirmed. Only the phone's owner can make staff passes.")
    setBusy(true)
    try {
      setPass(await createPass(session.credential.token, event.id, label.trim(), hours))
    } catch (e) {
      setError(session.explain(e))
    } finally {
      setBusy(false)
    }
  }

  if (pass && left) {
    return (
      <Screen>
        <Body style={{ fontWeight: "700", fontSize: 18 }}>Pass for {label.trim()}</Body>
        <View style={{ alignItems: "center", backgroundColor: "#fff", borderRadius: 12, padding: 12 }}>
          <Image source={{ uri: pass.qr }} style={{ width: 260, height: 260 }} accessibilityLabel="Staff pass QR code" />
        </View>
        <Body>
          On THEIR phone: open DevEvent Scanner, choose &quot;I&apos;m door staff&quot;, and scan this. It checks in &quot;{pass.eventTitle}&quot; only, until{" "}
          {new Date(pass.deviceExpiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
        </Body>
        <Body muted>Works once · {left}</Body>
        <Button label="Done" variant="secondary" onPress={() => { setPass(null); setLabel("") }} />
      </Screen>
    )
  }

  return (
    <Screen>
      <Card>
        <Body muted>Event</Body>
        <Body style={{ fontWeight: "700" }}>{event?.title ?? "No event selected"}</Body>
      </Card>
      <Body>Who will use the phone?</Body>
      <TextInput value={label} onChangeText={setLabel} placeholder="Gate A, Tunde" placeholderTextColor={colors.muted} maxLength={60} style={styles.input} />
      <Body>Works for</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {DURATIONS.map((d) => (
          <Pressable
            key={d.hours}
            accessibilityRole="radio"
            accessibilityState={{ selected: hours === d.hours }}
            onPress={() => setHours(d.hours)}
            style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: hours === d.hours ? colors.primary : colors.border }}
          >
            <Text style={{ color: hours === d.hours ? colors.primary : colors.text, fontWeight: "600" }}>{d.label}</Text>
          </Pressable>
        ))}
      </View>
      {pass && !left && <Body muted>The last pass expired before it was scanned. Make a new one.</Body>}
      <ErrorText message={error} />
      <Button label="Make staff pass" onPress={() => void make()} busy={busy} disabled={!event || label.trim().length < 2} />
    </Screen>
  )
}
