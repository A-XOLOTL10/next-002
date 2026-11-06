import { Alert } from "react-native"
import { router } from "expo-router"
import { Body, Button, Card, Screen, useGuard } from "@/components/ui"
import { API_URL } from "@/lib/api"
import { useSession } from "@/lib/session"

const formatTime = (iso: string): string => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })

/**
 * About this phone. Deliberately has no account settings (password, email, two-factor): those
 * exist only on the website, so a phone at the door can never be used to change them.
 */
export default function Menu() {
  const guard = useGuard()
  const session = useSession()
  if (guard) return guard
  const device = session.credential!.device
  const isAdmin = device.kind === "admin"

  const confirmSignOut = () =>
    Alert.alert(
      isAdmin ? "Unlink this phone?" : "Reset this phone?",
      isAdmin ? "Admin access is removed from this phone. You can link it again from the website." : "This phone stops being a scanner. You'll need a new staff pass to use it again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: isAdmin ? "Unlink" : "Reset", style: "destructive", onPress: () => void session.signOut(isAdmin ? "This phone was unlinked." : "This phone was reset.") },
      ],
    )

  return (
    <Screen>
      <Card>
        <Body style={{ fontWeight: "700", fontSize: 18 }}>{isAdmin ? `Admin: ${device.name}` : `Staff: ${device.name}`}</Body>
        {isAdmin ? (
          <Body muted>Can check in any live event and hand out staff passes.</Body>
        ) : (
          <Body muted>Can check in &quot;{device.eventTitle}&quot; only. Pass from {device.issuedBy}.</Body>
        )}
        <Body muted>Works until {formatTime(device.expiresAt)}</Body>
        <Body muted>Server: {API_URL.replace(/^https?:\/\//, "")}</Body>
      </Card>

      {isAdmin && (
        <>
          <Button label="Give a staff member a pass" onPress={() => router.push("/pass")} disabled={!session.event} />
          <Button label="Staff phones for this event" variant="secondary" onPress={() => router.push("/staff")} disabled={!session.event} />
          <Button
            label="Lock admin access now"
            variant="secondary"
            onPress={() => {
              session.lock()
              router.replace("/unlock")
            }}
          />
        </>
      )}

      <Body muted>
        {isAdmin
          ? "Never hand this phone to door staff: give them a staff pass for their own phone. Passwords and account settings are only on the website."
          : "This phone only checks tickets in. It has no account, password or settings to change."}
      </Body>
      <Button label={isAdmin ? "Unlink this phone" : "Reset this phone"} variant="danger" onPress={confirmSignOut} />
    </Screen>
  )
}
