import { VERIFICATION_HOURS, VERIFICATION_TARGET_MINUTES } from "@/database/user.constants"

// The verification promise: about 10 minutes during working hours (9am to 6pm WAT, Mon-Fri),
// longer outside them, because the people we call to confirm a partnership work those hours too.

/** True during verification hours, in Lagos time. */
export function isWithinVerificationHours(at: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: VERIFICATION_HOURS.timezone, weekday: "short", hour: "numeric", hour12: false }).formatToParts(at)
  const weekday = parts.find((p) => p.type === "weekday")?.value
  const hour = Number(parts.find((p) => p.type === "hour")?.value)
  return weekday !== "Sat" && weekday !== "Sun" && hour >= VERIFICATION_HOURS.startHour && hour < VERIFICATION_HOURS.endHour
}

/** The sentence hosts see (and get by email) when they send their details. */
export const verificationTimingMessage = (at: Date = new Date()): string =>
  isWithinVerificationHours(at)
    ? `This usually takes about ${VERIFICATION_TARGET_MINUTES} minutes.`
    : `Our team verifies hosts ${VERIFICATION_HOURS.label}, so this may take longer than usual. We'll email you as soon as it's done.`

/** Minutes a request has been waiting, for the approvals queue and the host's status card. */
export const minutesWaiting = (since: Date | string | undefined, now = Date.now()): number =>
  since ? Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000)) : 0
