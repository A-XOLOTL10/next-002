"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import type { ImageDisplay } from "@/database/event.constants"

const SLIDE_MS = 5000

type Props = {
  images: string[]
  display: ImageDisplay
  title: string
  /** Controls add arrows and dots. Off on event cards, where the whole card is a link. */
  controls?: boolean
  /** Browser hint for choosing an image size. */
  sizes: string
  /** Load immediately: for the main image at the top of a page. */
  preload?: boolean
}

/** One fixed design, or a slider through all of an event's designs. Fills its parent. */
const EventImages = ({ images, display, title, controls = false, sizes, preload = false }: Props) => {
  const isSlider = display === "slider" && images.length > 1
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!isSlider || paused) return
    // Respect visitors who've asked their device to reduce motion.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    const timer = setInterval(() => setActive((current) => (current + 1) % images.length), SLIDE_MS)
    return () => clearInterval(timer)
  }, [isSlider, paused, images.length])

  if (images.length === 0) {
    return <div className="bg-dark-200 text-light-200 flex-center absolute inset-0 text-sm">No image yet</div>
  }

  const shown = isSlider ? images : images.slice(0, 1)
  const move = (step: number) => setActive((current) => (current + step + images.length) % images.length)

  return (
    <div
      className="absolute inset-0"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {shown.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt={index === 0 ? title : `${title}, design ${index + 1}`}
          fill
          sizes={sizes}
          preload={preload && index === 0}
          className={`object-cover transition-opacity duration-700 ${index === active ? "opacity-100" : "opacity-0"}`}
        />
      ))}

      {isSlider && controls && (
        <>
          <button type="button" className="slider-arrow left-3" aria-label="Previous design" onClick={() => move(-1)}>&#8249;</button>
          <button type="button" className="slider-arrow right-3" aria-label="Next design" onClick={() => move(1)}>&#8250;</button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {images.map((src, index) => (
              <button
                key={src}
                type="button"
                aria-label={`Show design ${index + 1}`}
                aria-current={index === active}
                onClick={() => setActive(index)}
                className={`size-2.5 cursor-pointer rounded-full ${index === active ? "bg-primary" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default EventImages
