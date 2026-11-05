"use client"

import { useState } from "react"
import { finishOnboardingAction } from "@/lib/actions/auth.actions"

const SLIDES = [
  {
    title: "Welcome to DevEvent",
    body: "DevEvent is where developers find hackathons, meetups and conferences. As a host, you list your events here, and people book with a verified email.",
    icon: "👋",
  },
  {
    title: "1. Get verified",
    body: "Tell us about your company and the companies or sponsors behind your events, and upload a government-issued ID. We call the organizations to confirm they're involved. During working hours this usually takes about 10 minutes.",
    icon: "🛡️",
  },
  {
    title: "2. Create your event",
    body: "Add the details, your images (or let AI make one from your description and logo), the event contact, and a letter signed by your CEO approving the event.",
    icon: "🛠️",
  },
  {
    title: "3. We review it",
    body: "Our team checks every event and every change before visitors see it. That keeps fake and unsafe events off the platform, especially events young people attend.",
    icon: "🔍",
  },
  {
    title: "4. Watch bookings, check people in",
    body: "Your dashboard shows how many people booked (they've all confirmed their email) and, on the day, scan each ticket's QR code at the door. Each ticket works once.",
    icon: "🎟️",
  },
]

/**
 * The welcome slides a host sees after their first sign-in (and from "How it works" later).
 * Arrow keys work, nothing auto-advances (people read at their own pace), and "Skip" is always
 * there. The last button records that onboarding is done and moves on to verification.
 */
export default function WelcomeSlides() {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[index]
  const last = index === SLIDES.length - 1

  return (
    <div
      className="bg-dark-100 border-dark-200 mx-auto flex w-full max-w-xl flex-col gap-6 rounded-[14px] border p-6 sm:p-8"
      role="region"
      aria-roledescription="carousel"
      aria-label="How DevEvent works"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" && !last) setIndex(index + 1)
        if (e.key === "ArrowLeft" && index > 0) setIndex(index - 1)
      }}
      tabIndex={0}
    >
      {/* key: each slide fades in fresh */}
      <div key={index} className="animate-in fade-in slide-in-from-right-4 flex min-h-56 flex-col gap-4 duration-300 motion-reduce:animate-none" aria-live="polite">
        <span className="text-5xl" aria-hidden>{slide.icon}</span>
        <h2 className="text-2xl font-bold text-white">{slide.title}</h2>
        <p className="text-light-100 leading-relaxed">{slide.body}</p>
      </div>

      <div className="flex justify-center gap-2" role="tablist" aria-label="Slides">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Slide ${i + 1}: ${s.title}`}
            onClick={() => setIndex(i)}
            className={`h-2.5 cursor-pointer rounded-full transition-all ${i === index ? "bg-primary w-6" : "w-2.5 bg-white/30"}`}
          />
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <form action={finishOnboardingAction}>
          <button type="submit" className="text-light-200 cursor-pointer text-sm hover:underline">Skip</button>
        </form>
        <div className="flex gap-3">
          {index > 0 && (
            <button type="button" onClick={() => setIndex(index - 1)} className="cursor-pointer rounded-[6px] px-4 py-2 text-sm hover:underline">Back</button>
          )}
          {last ? (
            <form action={finishOnboardingAction}>
              <button type="submit" className="admin-button px-5 py-2">Get verified</button>
            </form>
          ) : (
            <button type="button" onClick={() => setIndex(index + 1)} className="admin-button px-5 py-2">Next</button>
          )}
        </div>
      </div>
    </div>
  )
}
