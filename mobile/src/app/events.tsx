import { Pressable } from "react-native"
import { router } from "expo-router"
import { Body, Card, Screen, useGuard } from "@/components/ui"
import { useSession } from "@/lib/session"
import { colors } from "@/theme"

/** Admin phones: which live event this phone is checking in. */
export default function Events() {
  const guard = useGuard({ adminOnly: true })
  const session = useSession()
  if (guard) return guard

  return (
    <Screen>
      {session.events.length === 0 && <Body>No live events right now.</Body>}
      {session.events.map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          onPress={() => {
            session.selectEvent(e.id)
            router.back()
          }}
        >
          <Card style={e.id === session.event?.id ? { borderColor: colors.primary } : undefined}>
            <Body style={{ fontWeight: "700" }}>{e.title}</Body>
            <Body muted>{e.date} · {e.time} · {e.location}</Body>
            <Body muted>{e.stats.checkedIn} of {e.stats.tickets} checked in</Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
