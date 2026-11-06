import { Stack } from "expo-router"
import { StatusBar } from "expo-status-bar"
import { SessionProvider } from "@/lib/session"
import { colors } from "@/theme"

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ title: "DevEvent Scanner" }} />
        <Stack.Screen name="link" options={{ title: "Scan setup code" }} />
        <Stack.Screen name="unlock" options={{ title: "Locked", headerBackVisible: false, gestureEnabled: false }} />
        <Stack.Screen name="scan" options={{ title: "Check-in", headerBackVisible: false }} />
        <Stack.Screen name="events" options={{ title: "Choose event" }} />
        <Stack.Screen name="menu" options={{ title: "This phone" }} />
        <Stack.Screen name="pass" options={{ title: "Staff pass" }} />
        <Stack.Screen name="staff" options={{ title: "Staff phones" }} />
      </Stack>
    </SessionProvider>
  )
}
