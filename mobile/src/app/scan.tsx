import { useEffect, useRef, useState } from "react"
import { Pressable, Text, TextInput, View } from "react-native"
import { Stack, router } from "expo-router"
import * as Haptics from "expo-haptics"
import QrScanner from "@/components/QrScanner"
import ResultCard from "@/components/ResultCard"
import { Body, Button, Card, ErrorText, Screen, styles, useGuard } from "@/components/ui"
import { admit, lookup } from "@/lib/api"
import { classify, normalizeTyped } from "@/lib/scan-text"
import { useSession } from "@/lib/session"
import type { ScanResult } from "@/lib/types"
import { colors } from "@/theme"

const NEXT_SCAN_AFTER_MS = 2500

/**
 * The door. Scan a QR code (or type the DEV- ticket ID), see VIP / regular / problem, then press
 * Admit. Scanning alone never lets anyone in, so a code caught by accident uses nothing up.
 */
export default function Scan() {
  const guard = useGuard()
  const session = useSession()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  if (guard) return guard
  const { event, credential } = session
  const isAdmin = credential?.device.kind === "admin"

  const reset = () => {
    if (timer.current) clearTimeout(timer.current)
    setResult(null)
    setCode(null)
    setError(null)
  }

  const check = async (ticketCode: string) => {
    if (!event || !credential) return
    setBusy(true)
    setError(null)
    try {
      const answer = await lookup(credential.token, event.id, ticketCode)
      setResult(answer)
      setCode(ticketCode)
      void Haptics.notificationAsync(answer.state === "valid" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error)
    } catch (e) {
      setError(session.explain(e))
    } finally {
      setBusy(false)
    }
  }

  const onScan = (data: string) => {
    const scanned = classify(data)
    if (scanned.type === "ticket") return void check(scanned.code)
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    setError(scanned.type === "setup" ? "That's a setup code, not a ticket. To change how this phone is set up, open the menu." : "That QR code isn't a DevEvent ticket.")
  }

  const letIn = async () => {
    if (!event || !credential || !code) return
    setBusy(true)
    try {
      const answer = await admit(credential.token, event.id, code)
      setResult(answer)
      if (answer.state === "admitted") {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        void session.refresh().catch(() => undefined) // new counts
        timer.current = setTimeout(reset, NEXT_SCAN_AFTER_MS)
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      }
    } catch (e) {
      setError(session.explain(e))
    } finally {
      setBusy(false)
    }
  }

  const header = <Stack.Screen options={{ headerRight: () => <Pressable accessibilityRole="button" onPress={() => router.push("/menu")} hitSlop={12}><Text style={{ color: colors.primary, fontSize: 17, fontWeight: "600" }}>Menu</Text></Pressable> }} />

  if (!event) {
    return (
      <Screen>
        {header}
        <Body>{isAdmin ? "There are no live events to check in right now." : "The event on this pass isn't available. Ask your admin for a new pass."}</Body>
        <Button label="Refresh" variant="secondary" onPress={() => void session.refresh().catch(() => undefined)} />
      </Screen>
    )
  }

  return (
    <Screen>
      {header}
      <Card>
        <Body style={{ fontWeight: "700", fontSize: 18 }}>{event.title}</Body>
        <Body muted>{event.date} · {event.time} · {event.venue}</Body>
        <Body>
          {event.stats.checkedIn} of {event.stats.tickets} in · <Text style={{ color: colors.vip }}>VIP {event.stats.vipCheckedIn} of {event.stats.vip}</Text>
        </Body>
        {(event.tags.regular || event.tags.vip) && (
          <Body muted>
            {event.tags.regular ? `Regular: ${event.tags.regular}` : ""}
            {event.tags.regular && event.tags.vip ? "  ·  " : ""}
            {event.tags.vip ? `VIP: ${event.tags.vip}` : ""}
          </Body>
        )}
        {isAdmin && session.events.length > 1 && (
          <Pressable accessibilityRole="button" onPress={() => router.push("/events")}>
            <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 16 }}>Change event</Text>
          </Pressable>
        )}
      </Card>

      {result ? (
        <View style={{ gap: 12 }}>
          <ResultCard result={result} />
          {result.state === "valid" && <Button label={result.tier === "vip" ? "Admit VIP" : "Admit"} onPress={() => void letIn()} busy={busy} />}
          <ErrorText message={error} />
          <Button label="Scan next" variant="secondary" onPress={reset} />
        </View>
      ) : (
        <>
          <QrScanner onScan={onScan} paused={busy} hint={busy ? "Checking..." : "Point at the ticket's QR code"} />
          <ErrorText message={error} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Or type DEV-XXXXXXXXXX"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => typed.trim() && void check(normalizeTyped(typed))}
              style={[styles.input, { flex: 1, fontFamily: "monospace" }]}
            />
            <View style={{ width: 96 }}>
              <Button label="Find" onPress={() => void check(normalizeTyped(typed))} disabled={!typed.trim()} busy={busy} />
            </View>
          </View>
        </>
      )}
    </Screen>
  )
}
