import WelcomeSlides from "@/components/host/WelcomeSlides"
import { requireHost } from "@/lib/auth"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

// Shown after a host's first sign-in (landingFor sends un-onboarded hosts here), and from the
// "How it works" link afterwards.
export default async function WelcomePage() {
  const session = await requireHost()
  return (
    <div className="flex flex-col gap-6">
      <p className="text-light-200 text-center text-sm">Hi {session.user.name.split(" ")[0]}, here&apos;s how hosting works.</p>
      <WelcomeSlides />
    </div>
  )
}
