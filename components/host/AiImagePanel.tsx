"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { generateImageAction } from "@/lib/actions/host.actions"
import { cloudinaryLoader } from "@/lib/image-loader"
import { DESIGN_CATEGORIES, DESIGN_STANDARD, DESIGN_STYLES, IMAGE_FORMAT, type DesignStyle } from "@/lib/design-categories"
import { EVENT_CATEGORIES, type EventCategory } from "@/database/event.constants"

const field = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null)?.value ?? ""

/**
 * "Design with AI", inside the host's event form. The design follows the event's category (the
 * Category field above): each category has a fixed brief, and every image also follows the house
 * rules (lib/design-categories.ts), so all events of a kind look consistent. The host adds what
 * they want in their own words, picks a style, and can attach their logo or photos.
 *
 * It isn't a <form> of its own (forms can't be nested): the button gathers the inputs and calls
 * the Server Action directly. Each result becomes a hidden "aiImages" input with a signed value,
 * which the server checks really was generated for this host before attaching it to the event.
 */
export default function AiImagePanel() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<{ url: string; grant: string }[]>([])
  const [category, setCategory] = useState<EventCategory | "">("")
  const [style, setStyle] = useState<DesignStyle>("modern")
  const prompt = useRef<HTMLTextAreaElement>(null)
  const includeDetails = useRef<HTMLInputElement>(null)
  const references = useRef<HTMLInputElement>(null)

  // Follow the form's Category field, so the brief shown here always matches it.
  useEffect(() => {
    const select = document.getElementById("category") as HTMLSelectElement | null
    if (!select) return
    const sync = () => setCategory(EVENT_CATEGORIES.find((c) => c === select.value) ?? "")
    sync()
    select.addEventListener("change", sync)
    return () => select.removeEventListener("change", sync)
  }, [])

  const generate = () => {
    if (!category) {
      setError("Choose the event's Category above first. It decides the design.")
      document.getElementById("category")?.focus()
      return
    }
    const formData = new FormData()
    formData.set("category", category)
    formData.set("style", style)
    formData.set("title", field("title"))
    formData.set("description", [field("description"), field("overview").slice(0, 500)].filter(Boolean).join("\n"))
    formData.set("prompt", prompt.current?.value ?? "")
    formData.set("date", field("date"))
    formData.set("city", field("location"))
    if (includeDetails.current?.checked) formData.set("includeDetails", "on")
    for (const file of Array.from(references.current?.files ?? [])) formData.append("references", file)

    setError(null)
    startTransition(async () => {
      try {
        const result = await generateImageAction(null, formData)
        if (result.ok) setImages((list) => [...list, { url: result.url, grant: result.grant }])
        else setError(result.message)
      } catch {
        setError("Couldn't reach the server. Check your connection and try again.")
      }
    })
  }

  const brief = category ? DESIGN_CATEGORIES[category] : null

  return (
    <section className="border-primary/30 flex flex-col gap-4 rounded-[10px] border p-4" aria-labelledby="ai-design-title">
      <div>
        <h2 id="ai-design-title" className="text-lg font-semibold">Design your event image with AI</h2>
        <p className="text-light-200 text-xs">
          {IMAGE_FORMAT.label}. Up to 10 images a day. Every image is checked by our team with the rest of your event.
        </p>
      </div>

      {/* The category's fixed brief, so hosts know what the design will be based on. */}
      <div className="bg-dark-200/50 rounded-md p-3 text-sm">
        {brief ? (
          <>
            <p><span className="text-light-200">Design for</span> <strong>{brief.label}</strong>: {brief.hostHint}</p>
            <details className="mt-2">
              <summary className="text-light-200 cursor-pointer text-xs">What the AI is told</summary>
              <p className="mt-2 text-xs"><strong>Category brief:</strong> {brief.brief}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {DESIGN_STANDARD.map((rule) => <li key={rule}>{rule}</li>)}
              </ul>
            </details>
          </>
        ) : (
          <p className="text-amber-400">Choose the event&apos;s Category above. Each category has its own design style.</p>
        )}
      </div>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Describe the image you want</span>
        <textarea
          ref={prompt}
          rows={3}
          maxLength={600}
          placeholder="e.g. a stage with a big screen showing code, our brand colours purple and white, a cityscape of Lagos in the background"
          className="admin-input"
        />
        <span className="text-light-200 text-xs">Optional. Your event title and description are used too.</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Style</span>
          <select value={style} onChange={(e) => setStyle(e.target.value as DesignStyle)} className="admin-input">
            {(Object.keys(DESIGN_STYLES) as DesignStyle[]).map((key) => <option key={key} value={key}>{DESIGN_STYLES[key].label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Your logo or photos (optional, up to 3)</span>
          <input ref={references} type="file" accept="image/png,image/jpeg,image/webp" multiple className="admin-input" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input ref={includeDetails} type="checkbox" /> Also put the date and city on the image
      </label>

      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      <button type="button" onClick={generate} disabled={pending} aria-busy={pending} className="admin-button w-fit">
        {pending ? "Designing (up to a minute)..." : images.length ? "Generate another" : "Generate image"}
      </button>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((image) => (
            <div key={image.url} className="flex flex-col gap-1 text-xs">
              <Image src={image.url} alt="AI-designed event image" width={240} height={135} loader={cloudinaryLoader} className="h-[135px] w-[240px] rounded-md object-cover" />
              {/* Submitted with the event form. */}
              <input type="hidden" name="aiImages" value={image.grant} />
              <button type="button" onClick={() => setImages((list) => list.filter((i) => i.url !== image.url))} className="w-fit cursor-pointer text-red-400 hover:underline">
                Don&apos;t use this one
              </button>
            </div>
          ))}
          <p className="text-light-200 w-full text-xs">Kept images are added to the event when you save. Remove any you don&apos;t want.</p>
        </div>
      )}
    </section>
  )
}
