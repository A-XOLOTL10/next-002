import type { Metadata } from "next"
import LegalPage, { CONTACT_EMAIL, ContactLines } from "@/components/LegalPage"

export const metadata: Metadata = {
  title: "Privacy Policy | DevEvent",
  description: "What personal data DevEvent collects, why, who it's shared with, and your rights.",
}

// Static page: Google, GitHub and LinkedIn link to it from their sign-in screens.
// Keep it in step with the code: if a feature starts collecting something new, add it here.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="4 November 2026">
      <p>
        DevEvent (&quot;we&quot;, &quot;us&quot;) lists developer events and lets people book them. This policy explains what
        personal data we collect when you use next-002.vercel.app, why we collect it, who we share it with, how long
        we keep it, and the choices you have.
      </p>

      <h2>1. What we collect</h2>
      <h3>When you book an event</h3>
      <ul>
        <li>Your email address, used to confirm the booking and send your ticket.</li>
        <li>Your ticket ID and QR code, the time you booked and confirmed, and the time your ticket was scanned at the event.</li>
        <li>We don&apos;t ask for your name or any payment details to book a free event.</li>
      </ul>

      <h3>When you create a host account</h3>
      <ul>
        <li>Your name, email address, and whether you host as a company or an individual (with your company name and email domain).</li>
        <li>Your password, which we store only as a one-way hash. We can&apos;t read it.</li>
        <li>
          If you sign in with Google, GitHub or LinkedIn: your name, email address, whether that email is verified and your
          profile picture. From Google we also receive your company domain if you use a Google Workspace account. From
          GitHub we receive your organization memberships if you allow it. We never receive your password for those services.
        </li>
        <li>Details you send us about events you want to host, including images, and contact details in request files.</li>
      </ul>

      <h3>Security information</h3>
      <ul>
        <li>
          Your IP address, approximate location (country and city, worked out from the IP address), browser and device
          type, and the times of sign-ins and failed sign-in attempts. We use this to stop abuse, limit repeated attempts and
          spot sign-ins that don&apos;t look like you.
        </li>
        <li>For our own team&apos;s accounts, we also record the actions they take in the management area.</li>
      </ul>

      <h3>Usage analytics</h3>
      <ul>
        <li>
          Pages viewed, clicks, errors, browser and device type and approximate location, collected with PostHog to
          understand how the site is used and fix problems. We don&apos;t collect analytics on account management pages or
          booking confirmation pages, and one-time links are removed before anything is sent.
        </li>
      </ul>

      <h3>Cookies and similar storage</h3>
      <ul>
        <li><strong>Sign-in cookie:</strong> keeps you signed in. Required for accounts.</li>
        <li><strong>Visitor choice cookie:</strong> remembers that you chose to continue as a visitor (kept for up to 1 year).</li>
        <li><strong>Analytics storage:</strong> PostHog stores an anonymous identifier in your browser to count visits.</li>
        <li><strong>Security check:</strong> after repeated failed sign-ins we may show a Cloudflare Turnstile check, which uses its own cookies to tell people from bots.</li>
      </ul>

      <h2>2. How we use your data</h2>
      <ul>
        <li>To confirm bookings, send tickets, and check tickets at the event entrance.</li>
        <li>To create and manage host accounts and review, publish and manage event listings.</li>
        <li>To keep the service and your account secure, including detecting unusual sign-ins.</li>
        <li>To answer your messages and send emails about your bookings or account. We don&apos;t send marketing emails without asking you first.</li>
        <li>To understand how the site is used and improve it.</li>
        <li>To meet legal obligations.</li>
      </ul>
      <p>
        We rely on what you asked us to do (providing a booking or an account), our legitimate interest in running a safe,
        working service, your consent where we ask for it, and legal obligations.
      </p>

      <h2>3. Who we share it with</h2>
      <p>We don&apos;t sell your personal data. We share it only with:</p>
      <ul>
        <li>
          <strong>Event organizers:</strong> if you book an event, we may share your email address and whether you checked in
          with that event&apos;s organizer so they can run the event.
        </li>
        <li>
          <strong>Service providers</strong> who run parts of DevEvent for us and may only use the data for that purpose:
          Vercel (hosting), MongoDB Atlas (database), Cloudinary (image storage), Google (sending email through Gmail and
          Google sign-in), GitHub and LinkedIn (sign-in), PostHog (analytics), Cloudflare (bot checks) and Anthropic (AI that
          helps our team turn event request files into draft listings).
        </li>
        <li>Authorities, when the law requires it, or to protect people&apos;s safety or our rights.</li>
      </ul>

      <h2>4. International transfers</h2>
      <p>
        Our service providers may store and process data outside your country, including in the United States and the
        European Union. When they do, we rely on their contractual and security commitments to protect it.
      </p>

      <h2>5. How long we keep it</h2>
      <ul>
        <li>Unconfirmed bookings: deleted automatically 24 hours after the confirmation link was sent.</li>
        <li>Confirmed bookings: kept while the event remains in our records, and deleted with the event or sooner if you ask.</li>
        <li>Records used to limit repeated attempts: deleted automatically, usually within an hour.</li>
        <li>Activity records for our team&apos;s accounts: 12 months, then deleted automatically.</li>
        <li>Host accounts: until you ask us to delete your account.</li>
        <li>Analytics: according to our analytics provider&apos;s retention settings.</li>
      </ul>

      <h2>6. How we protect it</h2>
      <p>
        Data is encrypted in transit (HTTPS). Passwords and one-time links are stored only as hashes. Access to personal
        data is limited to people who need it, and sign-in attempts are rate-limited and monitored. No system is perfectly
        secure, so if a breach affects you, we&apos;ll tell you and the relevant authority as the law requires.
      </p>

      <h2>7. Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>give you a copy of the personal data we hold about you;</li>
        <li>correct it if it&apos;s wrong;</li>
        <li>delete it, or cancel a booking;</li>
        <li>stop or limit a particular use of it, or withdraw consent you gave;</li>
        <li>send it to you in a portable format.</li>
      </ul>
      <p>
        Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and we&apos;ll reply within 30 days. We may need to
        confirm your identity first. You can also complain to your data protection authority, which in Nigeria is the
        Nigeria Data Protection Commission.
      </p>

      <h2>8. Children</h2>
      <p>
        DevEvent isn&apos;t aimed at children under 13, and we don&apos;t knowingly collect their data. You must be 18 or
        older to create a host account. If you think a child has given us personal data, contact us and we&apos;ll delete it.
      </p>

      <h2>9. Changes to this policy</h2>
      <p>
        We&apos;ll update this page when our practices change and change the date at the top. If a change significantly
        affects how we use your data, we&apos;ll tell account holders by email before it takes effect.
      </p>

      <h2>10. Contact us</h2>
      <ContactLines />
    </LegalPage>
  )
}
