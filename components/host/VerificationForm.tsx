"use client"

import { startTransition, useActionState, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import { saveVerificationAction, type ActionState } from "@/lib/actions/host.actions"
import { DOCUMENT_RULES, ID_TYPES, ID_TYPE_LABELS, ORG_ROLES, type AccountType, type OrgRole } from "@/database/user.constants"
import type { HostProfileView } from "@/lib/host.service"

type OrgRow = { key: string; id?: string; name: string; role: OrgRole; contactName: string; contactPhone: string; contactEmail: string; website: string; status?: string }

const ROLE_LABELS: Record<OrgRole, string> = { owner: "Our own company", sponsor: "Sponsor", partner: "Partner" }
const STATUS_LABELS: Record<string, string> = { confirmed: "Confirmed", denied: "Denied", unreachable: "Couldn't reach", pending: "Not checked yet" }

const blankOrg = (role: OrgRole): OrgRow => ({ key: crypto.randomUUID(), name: "", role, contactName: "", contactPhone: "", contactEmail: "", website: "" })

/**
 * The host verification form. Organizations are edited as rows and sent as one JSON list; the
 * server validates everything again (lib/host.service.ts). "Save" keeps a draft; "Send for
 * verification" checks that everything is there first. Submitted manually (not <form action>)
 * so chosen files aren't cleared when there's an error to fix.
 */
export default function VerificationForm({ profile, userEmail, userName }: { profile: HostProfileView | null; userEmail: string; userName: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveVerificationAction, null)
  const [accountType, setAccountType] = useState<AccountType>(profile?.accountType ?? "company")
  const [orgs, setOrgs] = useState<OrgRow[]>(() =>
    profile?.organizations.length
      ? profile.organizations.map((o) => ({ key: o._id, id: o._id, name: o.name, role: o.role, contactName: o.contactName, contactPhone: o.contactPhone, contactEmail: o.contactEmail, website: o.website ?? "", status: o.status }))
      : [blankOrg("owner")],
  )
  const err = (key: string) => state?.errors?.[key] && <p className="text-xs text-red-400" role="alert">{state.errors[key]}</p>

  const update = (key: string, patch: Partial<OrgRow>) => setOrgs((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Includes the pressed button's name/value ("intent": save or submit).
    const formData = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter)
    formData.set("organizations", JSON.stringify(orgs.map((row) => ({ id: row.id, name: row.name, role: row.role, contactName: row.contactName, contactPhone: row.contactPhone, contactEmail: row.contactEmail, website: row.website || undefined }))))
    startTransition(() => formAction(formData))
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      {/* ---- who's hosting */}
      <Section title="Who is hosting?">
        <div className="flex flex-wrap gap-3">
          {(["company", "individual"] as const).map((type) => (
            <label key={type} className={`flex cursor-pointer items-center gap-2 rounded-[6px] border px-4 py-3 ${accountType === type ? "border-primary" : "border-dark-200"}`}>
              <input type="radio" name="accountType" value={type} checked={accountType === type} onChange={() => setAccountType(type)} />
              <span>
                <strong>{type === "company" ? "A company" : "An individual"}</strong>
                <span className="text-light-200 block text-xs">{type === "company" ? "Registered business or organization" : "You organize with sponsors behind you"}</span>
              </span>
            </label>
          ))}
        </div>
        {err("accountType")}
        {accountType === "individual" && (
          <p className="notice">DevEvent is for developer and corporate events, so individuals list at least one company or sponsor backing the event below. We contact them to confirm.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={accountType === "company" ? "Registered company name" : "Brand or company name (if any)"} error={err("companyName")}>
            <input name="companyName" defaultValue={profile?.companyName} maxLength={160} className="admin-input" />
          </Field>
          <Field label={accountType === "company" ? "Registration number (e.g. CAC RC number)" : "Registration number (if any)"} error={err("companyRegNumber")}>
            <input name="companyRegNumber" defaultValue={profile?.companyRegNumber} maxLength={60} className="admin-input" />
          </Field>
          <Field label="Address" error={err("companyAddress")}>
            <input name="companyAddress" defaultValue={profile?.companyAddress} maxLength={300} className="admin-input" />
          </Field>
          <Field label="Website" error={err("website")}>
            <input name="website" type="url" placeholder="https://" defaultValue={profile?.website} maxLength={300} className="admin-input" />
          </Field>
        </div>
        <Field label="What does your company or community do?" error={err("companyDescription")}>
          <textarea name="companyDescription" rows={3} defaultValue={profile?.companyDescription} maxLength={2000} className="admin-input" />
        </Field>
        <Field label="Social media (one link per line)" error={err("socials")}>
          <textarea name="socials" rows={3} placeholder={"https://linkedin.com/company/...\nhttps://x.com/..."} defaultValue={profile?.socials.join("\n")} className="admin-input" />
        </Field>
      </Section>

      {/* ---- contact person */}
      <Section title="Main contact" intro="The person our team calls about your account.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={err("contactName")}>
            <input name="contactName" defaultValue={profile?.contactName ?? userName} maxLength={120} className="admin-input" />
          </Field>
          <Field label="Role or job title" error={err("contactRole")}>
            <input name="contactRole" defaultValue={profile?.contactRole} maxLength={120} className="admin-input" />
          </Field>
          <Field label="Phone (with country code)" error={err("contactPhone")}>
            <input name="contactPhone" type="tel" placeholder="+234 800 000 0000" defaultValue={profile?.contactPhone} maxLength={40} className="admin-input" />
          </Field>
          <Field label="Email" error={err("contactEmail")}>
            <input name="contactEmail" type="email" defaultValue={profile?.contactEmail ?? userEmail} maxLength={254} className="admin-input" />
          </Field>
        </div>
      </Section>

      {/* ---- organizations */}
      <Section
        title="Companies and sponsors behind your events"
        intro="We contact each one to confirm they know about and support your events. If any of them denies it, your account is flagged."
      >
        {err("organizations")}
        <div className="flex flex-col gap-4">
          {orgs.map((org, index) => (
            <fieldset key={org.key} className="border-dark-200 flex flex-col gap-3 rounded-[10px] border p-4">
              <legend className="px-1 text-sm font-semibold">
                Organization {index + 1}
                {org.status && <span className="text-light-200 font-normal"> · {STATUS_LABELS[org.status] ?? org.status}</span>}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input value={org.name} onChange={(e) => update(org.key, { name: e.target.value })} maxLength={160} className="admin-input" />
                </Field>
                <Field label="Their role">
                  <select value={org.role} onChange={(e) => update(org.key, { role: e.target.value as OrgRole })} className="admin-input">
                    {ORG_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
                  </select>
                </Field>
                <Field label="Contact person there">
                  <input value={org.contactName} onChange={(e) => update(org.key, { contactName: e.target.value })} maxLength={120} className="admin-input" />
                </Field>
                <Field label="Their phone">
                  <input type="tel" value={org.contactPhone} onChange={(e) => update(org.key, { contactPhone: e.target.value })} maxLength={40} className="admin-input" />
                </Field>
                <Field label="Their email">
                  <input type="email" value={org.contactEmail} onChange={(e) => update(org.key, { contactEmail: e.target.value })} maxLength={254} className="admin-input" />
                </Field>
                <Field label="Website (optional)">
                  <input type="url" value={org.website} onChange={(e) => update(org.key, { website: e.target.value })} maxLength={300} className="admin-input" />
                </Field>
              </div>
              {orgs.length > 1 && (
                <button type="button" onClick={() => setOrgs((rows) => rows.filter((row) => row.key !== org.key))} className="w-fit cursor-pointer text-sm text-red-400 hover:underline">
                  Remove
                </button>
              )}
            </fieldset>
          ))}
          {orgs.length < 10 && (
            <button type="button" onClick={() => setOrgs((rows) => [...rows, blankOrg("sponsor")])} className="border-dark-200 hover:border-primary w-fit cursor-pointer rounded-[6px] border px-4 py-2 text-sm font-semibold">
              + Add a company or sponsor
            </button>
          )}
        </div>
      </Section>

      {/* ---- documents */}
      <Section title="Identity documents" intro={`Stored encrypted and seen only by our verification team. ${DOCUMENT_RULES.formats}, up to 4 MB each.`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type of ID" error={err("idType")}>
            <select name="idType" defaultValue={profile?.idDocument?.type ?? ""} className="admin-input">
              <option value="" disabled>Choose...</option>
              {ID_TYPES.map((type) => <option key={type} value={type}>{ID_TYPE_LABELS[type]}</option>)}
            </select>
          </Field>
          <Field label="ID number" error={err("idNumber")}>
            <input name="idNumber" defaultValue={profile?.idDocument?.number} maxLength={60} autoComplete="off" className="admin-input" />
          </Field>
          <Field label="Expiry date (if it has one)" error={err("idExpiresAt")}>
            <input name="idExpiresAt" type="date" defaultValue={profile?.idDocument?.expiresAt} className="admin-input" />
          </Field>
        </div>
        <Field label={profile?.idDocument ? "Replace the ID document (optional)" : "Photo or scan of the ID"} error={err("idFile")}>
          <input name="idFile" type="file" accept={DOCUMENT_RULES.accept} className="admin-input" />
          {profile?.idDocument && <p className="text-light-200 text-xs">An ID document is already uploaded.</p>}
        </Field>
        <Field label={accountType === "company" ? "Company registration certificate (and any other company documents)" : "Company or sponsor documents (optional)"} error={err("companyDocs")}>
          <input name="companyDocs" type="file" accept={DOCUMENT_RULES.accept} multiple className="admin-input" />
          {profile && profile.companyDocumentIds.length > 0 && (
            <p className="text-light-200 text-xs">{profile.companyDocumentIds.length} document(s) already uploaded. New uploads are added to them.</p>
          )}
        </Field>
      </Section>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consent" className="mt-1" />
        <span>
          I confirm these details are true, and I agree that DevEvent may contact the organizations above to verify them and
          keep my documents as described in the <Link href="/privacy" className="underline" target="_blank">Privacy Policy</Link>.
        </span>
      </label>
      {err("consent")}

      {state?.message && (
        <p className={`rounded-md border px-4 py-3 text-sm ${state.ok ? "border-green-400/40 text-green-400" : "border-red-400/40 text-red-400"}`} role="alert">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="submit" disabled={pending} className="admin-button text-lg">
          {pending ? "Sending..." : "Send for verification"}
        </button>
        <button type="submit" name="intent" value="save" disabled={pending} className="border-dark-200 cursor-pointer rounded-[6px] border px-4 py-2.5 font-semibold hover:underline disabled:opacity-60">
          Save and finish later
        </button>
      </div>
    </form>
  )
}

const Section = ({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) => (
  <section className="flex flex-col gap-4">
    <div>
      <h2 className="text-xl font-semibold">{title}</h2>
      {intro && <p className="text-light-200 text-sm">{intro}</p>}
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
