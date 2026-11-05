import Link from "next/link"
import type { HostProfileView } from "@/lib/host.service"
import { minutesWaiting, verificationTimingMessage } from "@/lib/business-hours"
import { VERIFICATION_TARGET_MINUTES } from "@/database/user.constants"

/** Where the host stands in verification, and what to do next. */
export default function VerificationStatusCard({ profile }: { profile: HostProfileView | null }) {
  const status = profile?.status ?? "draft"
  const waited = minutesWaiting(profile?.submittedAt)

  const content: Record<string, { title: string; body: string; cta?: { href: string; label: string }; tone: string }> = {
    draft: {
      title: "Get verified to start hosting",
      body: "Tell us about your company and the sponsors behind your events, and upload a government ID. We'll contact the organizations to confirm.",
      cta: { href: "/host/verification", label: profile ? "Continue verification" : "Start verification" },
      tone: "border-primary/40",
    },
    pending_review: {
      title: "We're verifying your details",
      body: waited > VERIFICATION_TARGET_MINUTES
        ? `This is taking longer than usual (${waited} minutes so far), usually because an organization hasn't answered yet. ${verificationTimingMessage()}`
        : `We're contacting the organizations you listed. ${verificationTimingMessage()}`,
      tone: "border-amber-400/40",
    },
    appeal_pending: { title: "We're reviewing your response", body: "We'll email you once we've looked at your explanation again.", tone: "border-amber-400/40" },
    needs_info: { title: "We need a little more information", body: profile?.decisionReason ?? "Please update your details.", cta: { href: "/host/verification", label: "Update my details" }, tone: "border-amber-400/40" },
    denied: {
      title: "We couldn't verify your partnership",
      body: "An organization you listed didn't confirm being involved. If there's been a mix-up, you can respond once with an explanation.",
      cta: { href: "/host/verification", label: "Respond to this decision" },
      tone: "border-red-400/40",
    },
    rejected: { title: "Your application wasn't approved", body: profile?.decisionReason ?? "Contact us if you think this is a mistake.", tone: "border-red-400/40" },
    suspended: { title: "Your host account is suspended", body: profile?.decisionReason ?? "Contact us to discuss this.", tone: "border-red-400/40" },
  }
  const card = content[status] ?? content.draft

  return (
    <div className={`bg-dark-100 flex flex-col gap-3 rounded-[10px] border px-5 py-5 ${card.tone}`} role="status">
      <h2 className="text-xl font-semibold">{card.title}</h2>
      <p className="text-light-100 text-sm leading-relaxed">{card.body}</p>
      {card.cta && <Link href={card.cta.href} className="admin-button w-fit">{card.cta.label}</Link>}
    </div>
  )
}
