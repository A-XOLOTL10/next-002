import { Redirect, router } from "expo-router"
import { Body, Button, Card, Loading, Screen, Title } from "@/components/ui"
import { useSession } from "@/lib/session"
import { colors } from "@/theme"

/** First screen on a new phone: who is setting it up. */
export default function Setup() {
  const session = useSession()
  if (session.status === "loading") return <Loading />
  if (session.status === "ready") return <Redirect href="/" />

  return (
    <Screen>
      <Title>Check visitors in</Title>
      <Body muted>
        Scan tickets at the entrance. The app tells you straight away whether each guest is VIP or regular and what to hand them. Visitors book on the
        DevEvent website; this app is only for the door.
      </Body>
      {session.notice && (
        <Card style={{ borderColor: colors.warning }}>
          <Body>{session.notice}</Body>
        </Card>
      )}

      <Card>
        <Body style={{ fontWeight: "700", fontSize: 18 }}>I&apos;m door staff</Body>
        <Body muted>Scan the staff pass your admin shows you. Your phone can then check in that one event until the pass runs out. No account needed.</Body>
        <Button label="Scan staff pass" onPress={() => router.push({ pathname: "/link", params: { kind: "staff" } })} />
      </Card>

      <Card>
        <Body style={{ fontWeight: "700", fontSize: 18 }}>I&apos;m an admin</Body>
        <Body muted>
          On the website, open Console, then Mobile app, enter your authenticator code, and scan the code it shows. Only do this on your own phone: it
          gets your admin access, protected by your fingerprint, face or passcode.
        </Body>
        <Button label="Link my admin account" variant="secondary" onPress={() => router.push({ pathname: "/link", params: { kind: "admin" } })} />
      </Card>
    </Screen>
  )
}
