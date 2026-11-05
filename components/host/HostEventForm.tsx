"use client"

import { useState, type ReactNode } from "react"
import EventForm from "@/components/admin/EventForm"
import AiImagePanel from "@/components/host/AiImagePanel"
import type { EventFormState } from "@/lib/actions/admin.actions"
import type { EventFormValues } from "@/lib/admin-data"
import type { HostEventFormValues } from "@/lib/host-events.service"
import { AUDIENCE_AGES, AUDIENCE_AGE_LABELS, type AudienceAge } from "@/database/event.constants"
import { DOCUMENT_RULES } from "@/database/user.constants"

type Sponsor = { id: string; name: string; status: string }

type Props = {
  action: (state: EventFormState, formData: FormData) => Promise<EventFormState>
  initial?: HostEventFormValues
  sponsors: Sponsor[]
  aiEnabled: boolean
  /** "live": a published event, whose changes go to review as a revision. */
  mode: "new" | "draft" | "live"
  defaultContact: { name: string; phone: string; email: string }
}

/**
 * The host's event form: the same fields and rules as the admin form, plus who to contact,
 * the companies behind the event, who it's for (with safeguarding for under-18s), the signed
 * authorization letter, and AI images.
 */
export default function HostEventForm({ action, initial, sponsors, aiEnabled, mode, defaultContact }: Props) {
  const [age, setAge] = useState<AudienceAge | "">(initial?.audienceAge ?? "")

  const extra = (errors?: Record<string, string>) => {
    const err = (key: string) => errors?.[key] && <p className="text-xs text-red-400" role="alert">{errors[key]}</p>
    return (
      <>
        {aiEnabled && <AiImagePanel />}

        <Section title="Event contact" intro="Who our team (not visitors) calls about this event.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" error={err("contactName")}><input name="contactName" defaultValue={initial?.hostContact?.name ?? defaultContact.name} maxLength={120} className="admin-input" /></Field>
            <Field label="Phone" error={err("contactPhone")}><input name="contactPhone" type="tel" defaultValue={initial?.hostContact?.phone ?? defaultContact.phone} maxLength={40} className="admin-input" /></Field>
            <Field label="Email" error={err("contactEmail")}><input name="contactEmail" type="email" defaultValue={initial?.hostContact?.email ?? defaultContact.email} maxLength={254} className="admin-input" /></Field>
          </div>
        </Section>

        <Section title="Companies and sponsors behind this event" intro="Chosen from the organizations in your verification. We confirm each one is involved before the event goes live.">
          {sponsors.length === 0 ? (
            <p className="notice">Your verification has no organizations yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sponsors.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sponsorIds" value={s.id} defaultChecked={initial ? initial.sponsorIds.includes(s.id) : sponsors.length === 1} />
                  {s.name}
                  <span className="text-light-200 text-xs">({s.status === "confirmed" ? "confirmed" : "not confirmed yet"})</span>
                </label>
              ))}
            </div>
          )}
          {err("sponsorIds")}
        </Section>

        <Section title="Who is the event for?" intro="Events open to under-18s need a public venue and a named safeguarding contact.">
          <Field label="Audience age" error={err("audienceAge")}>
            <select name="audienceAge" value={age} onChange={(e) => setAge(e.target.value as AudienceAge)} className="admin-input">
              <option value="">Choose...</option>
              {AUDIENCE_AGES.map((a) => <option key={a} value={a}>{AUDIENCE_AGE_LABELS[a]}</option>)}
            </select>
          </Field>
          {age && age !== "adults" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Safeguarding contact's name" error={err("safeguardingName")}>
                <input name="safeguardingName" defaultValue={initial?.safeguardingContact?.name} maxLength={120} className="admin-input" />
              </Field>
              <Field label="Safeguarding contact's phone" error={err("safeguardingPhone")}>
                <input name="safeguardingPhone" type="tel" defaultValue={initial?.safeguardingContact?.phone} maxLength={40} className="admin-input" />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Authorization letter" intro={`A letter on company letterhead, signed by the CEO, approving this event (name, date and venue). ${DOCUMENT_RULES.formats}, up to 4 MB. Stored privately.`}>
          <Field label={initial?.hasAuthorizationLetter ? "Replace the letter (optional)" : "Signed letter"} error={err("authorizationLetter")}>
            <input name="authorizationLetter" type="file" accept={DOCUMENT_RULES.accept} className="admin-input" />
            {initial?.hasAuthorizationLetter && <p className="text-light-200 text-xs">A letter is already uploaded.</p>}
          </Field>
        </Section>
      </>
    )
  }

  const actions = (pending: boolean) =>
    mode === "live" ? (
      <button type="submit" name="intent" value="submit" disabled={pending} className="admin-button text-lg">
        {pending ? "Sending..." : "Send changes for review"}
      </button>
    ) : (
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="submit" disabled={pending} className="admin-button text-lg">{pending ? "Sending..." : "Send for review"}</button>
        <button type="submit" name="intent" value="save" disabled={pending} className="border-dark-200 cursor-pointer rounded-[6px] border px-4 py-2.5 font-semibold hover:underline disabled:opacity-60">
          Save draft
        </button>
      </div>
    )

  return (
    <EventForm action={action} initial={initial as unknown as EventFormValues | undefined} submitLabel="Save" actions={actions} relaxed>
      {extra}
    </EventForm>
  )
}

const Section = ({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3">
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {intro && <p className="text-light-200 text-xs">{intro}</p>}
    </div>
    {children}
  </section>
)

const Field = ({ label, error, children }: { label: string; error?: ReactNode; children: ReactNode }) => (
  <label className="flex flex-col gap-2 text-sm">
    <span className="font-semibold">{label}</span>
    {children}
    {error}
  </label>
)
