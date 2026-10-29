"use client"

import { startTransition, useActionState, type FormEvent, type ReactNode } from "react"
import Image from "next/image"
import type { EventFormState } from "@/lib/actions/admin.actions"
import type { EventFormValues } from "@/lib/admin-data"
import { EVENT_MODES } from "@/database/event.constants"

type Props = {
  /** createEventAction, or updateEventAction bound to the event's slug. */
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>
  /** Current values when editing; omitted when creating. */
  initial?: EventFormValues
  submitLabel: string
}

const inputClass = "bg-dark-200 w-full rounded-[6px] px-4 py-2.5"
const labelClass = "text-sm font-semibold"

/** Create/edit event form. Field names match the API's form-data parameters. */
const EventForm = ({ action, initial, submitLabel }: Props) => {
  const [state, formAction, pending] = useActionState(action, null)
  const isEdit = Boolean(initial)

  // Submitted manually instead of <form action>: a form action resets every field after
  // it runs, which would wipe a long form (and the chosen image) whenever validation fails.
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(() => formAction(formData))
  }

  const fieldError = (name: string) =>
    state?.errors?.[name] && <p className="text-xs text-red-400" role="alert">{state.errors[name]}</p>

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <Field label="Title" name="title" error={fieldError("title")}>
        <input id="title" name="title" required maxLength={200} defaultValue={initial?.title} className={inputClass} />
      </Field>

      <Field label="Description (short summary)" name="description" error={fieldError("description")}>
        <textarea id="description" name="description" required rows={3} defaultValue={initial?.description} className={inputClass} />
      </Field>

      <Field label="Overview (full details)" name="overview" error={fieldError("overview")}>
        <textarea id="overview" name="overview" required rows={5} defaultValue={initial?.overview} className={inputClass} />
      </Field>

      <Field label={isEdit ? "Image (leave empty to keep the current one)" : "Image"} name="image" error={fieldError("image")}>
        {initial?.image && (
          <Image src={initial.image} alt="Current event image" width={240} height={135} className="rounded-md object-cover" />
        )}
        <input id="image" name="image" type="file" accept="image/*" required={!isEdit} className={inputClass} />
        <p className="text-light-200 text-xs">PNG, JPEG or WebP, up to 5 MB.</p>
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Venue" name="venue" error={fieldError("venue")}>
          <input id="venue" name="venue" required defaultValue={initial?.venue} className={inputClass} />
        </Field>
        <Field label="Location (city, country)" name="location" error={fieldError("location")}>
          <input id="location" name="location" required defaultValue={initial?.location} className={inputClass} />
        </Field>
        <Field label="Date" name="date" error={fieldError("date")}>
          <input id="date" name="date" type="date" required defaultValue={initial?.date} className={inputClass} />
        </Field>
        <Field label="Start time" name="time" error={fieldError("time")}>
          <input id="time" name="time" type="time" required defaultValue={initial?.time} className={inputClass} />
        </Field>
        <Field label="Mode" name="mode" error={fieldError("mode")}>
          <select id="mode" name="mode" required defaultValue={initial?.mode ?? ""} className={inputClass}>
            <option value="" disabled>Choose a mode</option>
            {EVENT_MODES.map((mode) => (
              <option key={mode} value={mode}>{mode[0].toUpperCase() + mode.slice(1)}</option>
            ))}
          </select>
        </Field>
        <Field label="Audience" name="audience" error={fieldError("audience")}>
          <input id="audience" name="audience" required defaultValue={initial?.audience} className={inputClass} />
        </Field>
      </div>

      <Field label="Agenda (one item per line)" name="agenda" error={fieldError("agenda")}>
        <textarea
          id="agenda"
          name="agenda"
          required
          rows={5}
          placeholder={"09:00 AM - 10:00 AM | Keynote\n10:15 AM - 11:30 AM | Workshops"}
          defaultValue={initial?.agenda.join("\n")}
          className={inputClass}
        />
      </Field>

      <Field label="Organizer" name="organizer" error={fieldError("organizer")}>
        <textarea id="organizer" name="organizer" required rows={2} defaultValue={initial?.organizer} className={inputClass} />
      </Field>

      <Field label="Tags (comma separated)" name="tags" error={fieldError("tags")}>
        <input id="tags" name="tags" required placeholder="Cloud, DevOps, AI" defaultValue={initial?.tags.join(", ")} className={inputClass} />
      </Field>

      {state?.message && (
        <p className="rounded-md border border-red-400/40 px-4 py-3 text-sm text-red-400" role="alert">
          {state.message}
          {state.errors && " Check the highlighted fields."}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary hover:bg-primary/90 cursor-pointer rounded-[6px] px-4 py-3 text-lg font-semibold text-black disabled:opacity-60"
      >
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  )
}

const Field = ({ label, name, error, children }: { label: string; name: string; error: ReactNode; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <label htmlFor={name} className={labelClass}>{label}</label>
    {children}
    {error}
  </div>
)

export default EventForm
