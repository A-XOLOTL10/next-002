import { StyleSheet, Text, View } from "react-native"
import { Body } from "@/components/ui"
import type { ScanResult } from "@/lib/types"
import { colors } from "@/theme"

const formatTime = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

/**
 * The answer to a scan, readable at arm's length: a big VIP / REGULAR band (or a red problem),
 * what to hand the guest, and the ticket details.
 */
export default function ResultCard({ result }: { result: ScanResult }) {
  const good = result.state === "valid" || result.state === "admitted"
  const vip = result.tier === "vip"
  const band = !good ? colors.danger : vip ? colors.vip : colors.primary
  const headline = !good
    ? { used: "ALREADY USED", unconfirmed: "NOT CONFIRMED", wrong_event: "WRONG EVENT", not_found: "INVALID", over: "EVENT OVER" }[result.state as Exclude<ScanResult["state"], "valid" | "admitted">]
    : vip
      ? "VIP"
      : "REGULAR"

  return (
    <View style={styles.card} accessibilityLiveRegion="assertive">
      <View style={[styles.band, { backgroundColor: band }]}>
        <Text style={styles.headline}>{headline}</Text>
        {result.state === "admitted" && <Text style={styles.sub}>ADMITTED</Text>}
      </View>
      <View style={styles.body}>
        <Body style={{ fontSize: 18, fontWeight: "600" }}>{result.message}</Body>
        {good && result.tag && <Text style={[styles.tag, { color: vip ? colors.vip : colors.primary }]}>Give: {result.tag}</Text>}
        {result.state === "used" && result.checkedInAt && (
          <Body muted>
            Let in {formatTime(result.checkedInAt)}
            {result.checkedInBy ? ` by ${result.checkedInBy}` : ""}
          </Body>
        )}
        {result.ticketId && <Text style={styles.mono}>{result.ticketId}</Text>}
        {result.email && <Body muted>{result.email}</Body>}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, overflow: "hidden", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  band: { paddingVertical: 22, alignItems: "center" },
  headline: { color: colors.onPrimary, fontSize: 40, fontWeight: "900", letterSpacing: 2 },
  sub: { color: colors.onPrimary, fontSize: 16, fontWeight: "800", letterSpacing: 4, marginTop: 2 },
  body: { padding: 16, gap: 8 },
  tag: { fontSize: 24, fontWeight: "800" },
  mono: { color: colors.text, fontFamily: "monospace", fontSize: 18, letterSpacing: 1 },
})
