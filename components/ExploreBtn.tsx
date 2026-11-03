'use client'

import Image from "next/image"
import posthog from "posthog-js"

const ExploreBtn = () => {
  const handleExploreClick = () => {
    if (
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
      process.env.NEXT_PUBLIC_POSTHOG_HOST
    ) {
      posthog.logger.info("event_catalogue_exploration_started", {
        surface: "featured_catalogue",
      })
      posthog.capture("event_exploration_started")
    }
  }

  return (
    <a href="#events" id="explore-btn" className="mt-7 mx-auto" onClick={handleExploreClick}>
      Explore Events
      <Image src="/icons/arrow-down.svg" alt="" width={24} height={24} className="size-6" />
    </a>
  )
}

export default ExploreBtn
