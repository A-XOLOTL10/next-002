import HostNav from "@/components/host/HostNav"
import VerificationForm from "@/components/host/VerificationForm"
import VerificationStatusCard from "@/components/host/VerificationStatusCard"
import AppealForm from "@/components/host/AppealForm"
import { requireHost } from "@/lib/auth"
import { getHostProfile } from "@/lib/host.service"
import { VERIFICATION_HOURS } from "@/database/user.constants"

// Depends on the signed-in account, so it waits for its data (behind the session loader).
export const instant = false

// Host verification (KYC): the form while it's a draft or more information was requested,
// the status while our team reviews it, and the one-time response form after a denial.
export default async function VerificationPage({ searchParams }: PageProps<"/host/verification">) {
  const session = await requireHost()
  const [profile, params] = await Promise.all([getHostProfile(session.user.id), searchParams])
  const status = profile?.status ?? "draft"
  const editable = status === "draft" || status === "needs_info"

  return (
    <>
      <HostNav />
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold">Host verification</h1>
        <p className="text-light-100 text-sm">
          We verify every host to keep fake events, and anyone trying to lure people to unsafe places, off DevEvent. Our team
          verifies {VERIFICATION_HOURS.label}.
        </p>
      </div>

      {params.sent === "1" && (
        <p className="rounded-md border border-green-400/40 px-4 py-3 text-sm text-green-400" role="status">
          Sent! We&apos;ve emailed you a confirmation and will email again when we&apos;re done.
        </p>
      )}

      {status === "approved" ? (
        <div className="bg-dark-100 rounded-[10px] border border-green-400/40 p-5">
          <h2 className="text-xl font-semibold text-green-400">You&apos;re verified</h2>
          <p className="text-light-100 text-sm">You can create events. If your company or contact details change, contact us so we can check them again.</p>
        </div>
      ) : (
        <VerificationStatusCard profile={profile} />
      )}

      {status === "denied" && !profile?.appeal && <AppealForm />}
      {editable && <VerificationForm profile={profile} userEmail={session.user.email} userName={session.user.name} />}
    </>
  )
}
