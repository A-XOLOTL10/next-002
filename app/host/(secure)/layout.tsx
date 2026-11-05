import { Suspense } from "react"
import SessionLoader from "@/components/SessionLoader"
import { requireUser } from "@/lib/auth"

// Second gate for every protected /host page (proxy.ts is the first).
//
// The whole page sits inside <SessionGate>, which waits for the real session check. Until it
// passes, the only thing that can reach the browser is the loader below: no menu, no headings,
// nothing that hints at what's behind it. Signed-out visitors are redirected to the sign-in
// page; pages and actions then check the role themselves (requireHost / requireAdmin).
// Everything below depends on who's signed in, so it can't be prerendered or navigated to
// "instantly" by design: opt this section out of Next's instant-navigation validation. The
// loader above (and loading.tsx files) still give immediate feedback on every navigation.
export const instant = false

export default function SecureLayout({ children }: LayoutProps<"/host">) {
  return (
    <Suspense fallback={<SessionLoader />}>
      <SessionGate>{children}</SessionGate>
    </Suspense>
  )
}

async function SessionGate({ children }: { children: React.ReactNode }) {
  await requireUser()
  return <>{children}</>
}
