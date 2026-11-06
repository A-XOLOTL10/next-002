import { Redirect } from "expo-router"
import { useGuard } from "@/components/ui"

/** Start-up: setup, the lock screen, or straight to scanning. */
export default function Index() {
  return useGuard() ?? <Redirect href="/scan" />
}
