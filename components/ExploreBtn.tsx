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

    console.log("Explore button clicked")
  }

  return (
    <button type="button" id="explore-btn" className="mt-7 mx-auto" onClick={handleExploreClick} >
      <a href="#events">
        Explore Events
        <Image src="/icons/arrow-down.svg" alt="Arrow Down" width={24} height={24} />
      </a>
    </button>
  )
}

export default ExploreBtn
