import type { ReactNode } from "react"

export const CONTACT_EMAIL = "ultravine10@gmail.com"
export const CONTACT_WHATSAPP = { display: "+234 913 877 2943", href: "https://wa.me/2349138772943" }

/** Shared layout for the privacy policy and terms: plain, readable text with section headings. */
const LegalPage = ({ title, updated, children }: { title: string; updated: string; children: ReactNode }) => (
  <article
    className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-10 text-light-100
      [&_a]:text-primary [&_a]:underline [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-bold
      [&_h3]:mt-2 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-6"
  >
    <h1 className="text-4xl font-bold max-sm:text-3xl">{title}</h1>
    <p className="text-light-200 text-sm">Last updated: {updated}</p>
    {children}
  </article>
)

export const ContactLines = () => (
  <ul>
    <li>Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
    <li>WhatsApp: <a href={CONTACT_WHATSAPP.href}>{CONTACT_WHATSAPP.display}</a></li>
  </ul>
)

export default LegalPage
