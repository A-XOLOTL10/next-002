"use client"

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react"
import Image from "next/image"
import type { EventFormState } from "@/lib/actions/admin.actions"
import type { EventFormValues } from "@/lib/admin-data"
import { DEFAULT_TIMEZONE, EVENT_MODES, IMAGE_RULES } from "@/database/event.constants"
import { cloudinaryLoader, isCloudinaryUrl } from "@/lib/image-loader"

type Props = {
  /** createEventAction, or updateEventAction bound to the event's slug. */
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>
  /** Current values when editing; omitted when creating. */
  initial?: EventFormValues
  submitLabel: string
  /** Extra sections (the host form adds contact, sponsors, safety and the signed letter). */
  children?: ReactNode | ((errors?: Record<string, string>) => ReactNode)
  /** Replaces the submit button (the host form has "Save draft" and "Send for review"). */
  actions?: (pending: boolean) => ReactNode
  /** Hosts can save incomplete drafts; the server checks everything when they send it for review. */
  relaxed?: boolean
}

// A fixed list rather than the browser's full one, so server and browser render the same options.
const COMMON_TIMEZONES = [
  "Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Europe/London",
  "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "America/Toronto",
  "America/Sao_Paulo", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney", "UTC",
]

/** Create/edit event form. Field names match the API's form-data parameters. */
const EventForm = ({ action, initial, submitLabel, children, actions, relaxed = false }: Props) => {
  const [state, formAction, pending] = useActionState(action, null)
  const isEdit = Boolean(initial)
  // Drafts from the AI import may be incomplete, and can be saved a piece at a time.
  const required = !relaxed && initial?.status !== "draft"
  const existingImages = initial?.images ?? []

  // Submitted manually instead of <form action>: a form action resets every field after
  // it runs, which would wipe a long form (and the chosen images) whenever validation fails.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Saving a live event changes what visitors see straight away: confirm first.
    if (!relaxed && initial?.status === "published" && !window.confirm("Save these changes to a live event? Visitors will see them immediately.")) return
    // Includes the pressed button's name/value, so forms with several buttons know which one.
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    startTransition(() => formAction(formData))
  }

  const fieldError = (name: string) =>
    state?.errors?.[name] && <p className="text-xs text-red-400" role="alert">{state.errors[name]}</p>

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Title" name="title" error={fieldError("title")}>
        <input id="title" name="title" required maxLength={200} defaultValue={initial?.title} className="admin-input" />
      </Field>

      <Field label="Description (short summary)" name="description" error={fieldError("description")}>
        <textarea id="description" name="description" required={required} rows={3} defaultValue={initial?.description} className="admin-input" />
      </Field>

      <Field label="Overview (full details)" name="overview" error={fieldError("overview")}>
        <textarea id="overview" name="overview" required={required} rows={5} defaultValue={initial?.overview} className="admin-input" />
      </Field>

      <Field label={`Images (up to ${IMAGE_RULES.maxImages})`} name="images" error={fieldError("images")}>
        {existingImages.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {existingImages.map((src) => (
              <label key={src} className="flex flex-col gap-1 text-xs">
                <Image src={src} alt="Current event design" width={180} height={101} loader={isCloudinaryUrl(src) ? cloudinaryLoader : undefined} className="h-[101px] w-[180px] rounded-md object-cover" />
                <span className="flex items-center gap-1">
                  <input type="checkbox" name="removeImages" value={src} /> Remove
                </span>
              </label>
            ))}
          </div>
        )}
        <input
          id="images"
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          required={required && !isEdit}
          className="admin-input"
        />
        <p className="text-light-200 text-xs">
          {IMAGE_RULES.formats}, 5 MB or smaller each, at least {IMAGE_RULES.minWidth} x {IMAGE_RULES.minHeight} pixels.
          {" "}{IMAGE_RULES.recommended} works best.
        </p>
      </Field>

      <Field label="Image display" name="imageDisplay" error={fieldError("imageDisplay")}>
        <select id="imageDisplay" name="imageDisplay" defaultValue={initial?.imageDisplay ?? "static"} className="admin-input">
          <option value="static">Static: show one design</option>
          <option value="slider">Slider: rotate through all designs (needs 2 or more)</option>
        </select>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Venue" name="venue" error={fieldError("venue")}>
          <input id="venue" name="venue" required={required} defaultValue={initial?.venue} className="admin-input" />
        </Field>
        <Field label="Location (city, country)" name="location" error={fieldError("location")}>
          <input id="location" name="location" required={required} defaultValue={initial?.location} className="admin-input" />
        </Field>
        <Field label="Start date" name="date" error={fieldError("date")}>
          <input id="date" name="date" type="date" required={required} defaultValue={initial?.date} className="admin-input" />
        </Field>
        <Field label="Start time" name="time" error={fieldError("time")}>
          <input id="time" name="time" type="time" required={required} defaultValue={initial?.time} className="admin-input" />
        </Field>
        <Field label="End date (only if it runs over several days)" name="endDate" error={fieldError("endDate")}>
          <input id="endDate" name="endDate" type="date" defaultValue={initial?.endDate} className="admin-input" />
        </Field>
        <Field label="End time" name="endTime" error={fieldError("endTime")}>
          <input id="endTime" name="endTime" type="time" required={required} defaultValue={initial?.endTime} className="admin-input" />
        </Field>
        <Field label="Timezone" name="timezone" error={fieldError("timezone")}>
          <input id="timezone" name="timezone" list="timezones" required defaultValue={initial?.timezone ?? DEFAULT_TIMEZONE} className="admin-input" />
          <datalist id="timezones">
            {COMMON_TIMEZONES.map((zone) => <option key={zone} value={zone} />)}
          </datalist>
        </Field>
        <Field label="Mode" name="mode" error={fieldError("mode")}>
          <select id="mode" name="mode" required={required} defaultValue={initial?.mode ?? ""} className="admin-input">
            <option value="" disabled={required}>Choose a mode</option>
            {EVENT_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode[0].toUpperCase() + mode.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="Audience" name="audience" error={fieldError("audience")}>
          <input id="audience" name="audience" required={required} defaultValue={initial?.audience} className="admin-input" />
        </Field>
      </div>

      <Field label="Agenda (one item per line)" name="agenda" error={fieldError("agenda")}>
        <textarea
          id="agenda"
          name="agenda"
          required={required}
          rows={5}
          placeholder={"09:00 AM - 10:00 AM | Keynote\n10:15 AM - 11:30 AM | Workshops"}
          defaultValue={initial?.agenda?.join("\n")}
          className="admin-input"
        />
      </Field>

      <Field label="Organizer" name="organizer" error={fieldError("organizer")}>
        <textarea id="organizer" name="organizer" required={required} rows={2} defaultValue={initial?.organizer} className="admin-input" />
      </Field>

      <Field label="Tags (comma separated)" name="tags" error={fieldError("tags")}>
        <input id="tags" name="tags" required={required} placeholder="Cloud, DevOps, AI" defaultValue={initial?.tags?.join(", ")} className="admin-input" />
      </Field>

      {typeof children === "function" ? children(state?.errors) : children}

      {state?.message && (
        <p className="rounded-md border border-red-400/40 px-4 py-3 text-sm text-red-400" role="alert">
          {state.message}
          {state.errors && " Check the highlighted fields."}
        </p>
      )}

      {actions ? actions(pending) : (
        <button type="submit" disabled={pending} className="admin-button text-lg">
          {pending ? "Saving..." : submitLabel}
        </button>
      )}
    </form>
  )
}

const Field = ({ label, name, error, children }: { label: string; name: string; error: ReactNode; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className="text-sm font-semibold">{label}</label>
    {children}
    {error}
  </div>
)

export default EventForm
