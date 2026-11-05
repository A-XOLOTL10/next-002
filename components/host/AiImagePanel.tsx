"use client"

import { useRef, useState, useTransition } from "react"
import Image from "next/image"
import { generateImageAction } from "@/lib/actions/host.actions"
import { cloudinaryLoader } from "@/lib/image-loader"

const STYLE_LABELS = { modern: "Modern tech poster", photo: "Realistic photo", illustration: "Illustration", minimal: "Minimal typographic" } as const

/**
 * "Make an image with AI", inside the event form. It isn't a <form> of its own (forms can't be
 * nested): the button gathers the description, style and reference images and calls the Server
 * Action directly. Each result is added to the event as a hidden "aiImages" input holding a
 * signed value, which the server checks really was generated for this host.
 */
export default function AiImagePanel() {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<{ url: string; grant: string }[]>([])
  const style = useRef<HTMLSelectElement>(null)
  const notes = useRef<HTMLTextAreaElement>(null)
  const references = useRef<HTMLInputElement>(null)

  const generate = () => {
    // The event's own description is the starting point; extra notes are added to it.
    const description = [
      (document.getElementById("description") as HTMLTextAreaElement | null)?.value ?? "",
      (document.getElementById("overview") as HTMLTextAreaElement | null)?.value.slice(0, 600) ?? "",
      notes.current?.value ?? "",
    ].filter(Boolean).join("\n")
    const formData = new FormData()
    formData.set("description", description)
    formData.set("title", (document.getElementById("title") as HTMLInputElement | null)?.value ?? "")
    formData.set("style", style.current?.value ?? "modern")
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

  return (
    <section className="border-primary/30 flex flex-col gap-4 rounded-[10px] border p-4">
      <div>
        <h2 className="text-lg font-semibold">Make an image with AI</h2>
        <p className="text-light-200 text-xs">
          Uses your title and description. Add your logo or photos as references and the AI will use them. Up to 10 images a day; our
          team reviews every image before it&apos;s public.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Style</span>
          <select ref={style} defaultValue="modern" className="admin-input">
            {Object.entries(STYLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">Logo or reference images (optional, up to 3)</span>
          <input ref={references} type="file" accept="image/png,image/jpeg,image/webp" multiple className="admin-input" />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm">
        <span className="font-semibold">Anything else for the image? (optional)</span>
        <textarea ref={notes} rows={2} maxLength={400} placeholder="e.g. use our brand colours, purple and white; show laptops and a stage" className="admin-input" />
      </label>
      {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
      <button type="button" onClick={generate} disabled={pending} aria-busy={pending} className="admin-button w-fit">
        {pending ? "Creating image (up to a minute)..." : "Generate image"}
      </button>

      {images.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {images.map((image) => (
            <div key={image.url} className="flex flex-col gap-1 text-xs">
              <Image src={image.url} alt="AI-generated event image" width={240} height={135} loader={cloudinaryLoader} className="h-[135px] w-[240px] rounded-md object-cover" />
              {/* Submitted with the event form. */}
              <input type="hidden" name="aiImages" value={image.grant} />
              <button type="button" onClick={() => setImages((list) => list.filter((i) => i.url !== image.url))} className="w-fit cursor-pointer text-red-400 hover:underline">
                Don&apos;t use this one
              </button>
            </div>
          ))}
          <p className="text-light-200 w-full text-xs">These images are added to the event when you save.</p>
        </div>
      )}
    </section>
  )
}
