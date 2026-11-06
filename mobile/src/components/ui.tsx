import type { ReactNode } from "react"
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Redirect, type Href } from "expo-router"
import { useSession } from "@/lib/session"
import { colors } from "@/theme"

/** A screen's body: dark background, scrolls, clear of the home indicator. */
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.screen}>
      {scroll ? <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={[styles.content, { flex: 1 }]}>{children}</View>}
    </SafeAreaView>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.body, muted && { color: colors.muted }, style]}>{children}</Text>
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  busy,
}: {
  label: string
  onPress: () => void
  variant?: "primary" | "secondary" | "danger"
  disabled?: boolean
  busy?: boolean
}) {
  const palette = {
    primary: { backgroundColor: colors.primary, color: colors.onPrimary, borderColor: colors.primary },
    secondary: { backgroundColor: "transparent", color: colors.text, borderColor: colors.border },
    danger: { backgroundColor: "transparent", color: colors.danger, borderColor: colors.danger },
  }[variant]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [styles.button, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      {busy ? <ActivityIndicator color={palette.color} /> : <Text style={[styles.buttonLabel, { color: palette.color }]}>{label}</Text>}
    </Pressable>
  )
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null
}

export function Loading() {
  return (
    <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  )
}

/**
 * Sends the user where they belong if this screen isn't for them right now: setup when the phone
 * isn't linked, the lock screen when admin access is locked, and the scanner when a staff phone
 * opens an admin-only screen. Returns null when the screen may show.
 */
export function useGuard({ adminOnly = false }: { adminOnly?: boolean } = {}): ReactNode | null {
  const session = useSession()
  let to: Href | null = null
  if (session.status === "loading") return <Loading />
  if (session.status === "signed-out") to = "/setup"
  else if (session.locked) to = "/unlock"
  else if (adminOnly && session.credential?.device.kind !== "admin") to = "/scan"
  return to ? <Redirect href={to} /> : null
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  title: { color: colors.text, fontSize: 26, fontWeight: "700" },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  button: { minHeight: 52, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  buttonLabel: { fontSize: 17, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 15 },
  input: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 10, color: colors.text, fontSize: 18, paddingHorizontal: 14, minHeight: 52 },
})
