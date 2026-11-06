import type { Metadata } from "next"
import LegalPage, { CONTACT_EMAIL, ContactLines } from "@/components/LegalPage"

export const metadata: Metadata = {
  title: "Privacy Policy | DevEvent",
  description: "What personal data DevEvent collects, why, who it's shared with, and your rights.",
}

// Static page: Google and GitHub link to it from their sign-in screens.
// Keep it in step with the code: if a feature starts collecting something new, add it here.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="5 November 2026">
      <p>
        DevEvent (&quot;we&quot;, &quot;us&quot;) lists developer and corporate events and lets people book them. This policy
        explains what personal data we collect when you use next-002.vercel.app, why we collect it, who we share it with, how
        long we keep it, and the choices you have.
      </p>

      <h2>1. What we collect</h2>
      <h3>When you book an event</h3>
      <ul>
        <li>Your email address, used to confirm the booking and send your ticket.</li>
        <li>Your ticket ID and QR code, the time you booked and confirmed, and the time your ticket was scanned at the event.</li>
        <li>Whether your ticket is VIP or regular, and which staff member or device checked you in.</li>
        <li>We don&apos;t ask for your name or any payment details to book a free event.</li>
      </ul>
      <h3>When a host invites you as a VIP</h3>
      <ul>
        <li>
          An event&apos;s host (or our team) may add your email address to the event&apos;s VIP list. We then email you a ticket for that event and
          use your address only for that ticket and updates about the event.
        </li>
      </ul>

      <h3>When you create a host account</h3>
      <ul>
        <li>Your name, email address, and whether you host as a company or an individual.</li>
        <li>Your password, which we store only as a one-way hash. We can&apos;t read it.</li>
        <li>
          If you sign in with Google or GitHub: your name, email address, whether that email is verified, and your profile
          picture. From Google we also receive your company domain if you use a Google Workspace account. We never receive
          your password for those services.
        </li>
      </ul>

      <h3>When you verify your host account</h3>
      <ul>
        <li>Company details: name, registration number, address, description, website and social media links.</li>
        <li>A main contact person&apos;s name, role, phone number and email.</li>
        <li>
          A government-issued ID: its type, number and expiry date, and a photo or scan of it. If you host as a company, also
          your company registration documents.
        </li>
        <li>
          The companies and sponsors behind your events, with a contact person&apos;s name, phone number and email for each. We
          use these only to confirm with them that they are involved.
        </li>
        <li>Our team&apos;s notes from those checks (who we spoke to, when, and what they said), and our decisions.</li>
        <li>For each event you submit: an event contact, a safeguarding contact when under-18s may attend, and a letter signed by your company&apos;s CEO.</li>
      </ul>
      <p>
        These documents are encrypted before they are stored, are never published, and can only be opened by our verification
        team. Every time a team member opens one, it is recorded.
      </p>

      <h3>Security information</h3>
      <ul>
        <li>
          Your IP address, approximate location (country and city, worked out from the IP address), browser and device type,
          and the times of sign-ins and failed sign-in attempts. We use this to stop abuse, limit repeated attempts and spot
          sign-ins that don&apos;t look like you.
        </li>
        <li>
          A record of actions taken in host and team accounts (for example, submitting or approving an event), including who
          took them and when. For our own team, this also covers pages viewed, buttons clicked and time spent in the
          management area.
        </li>
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
        <li><strong>Sign-in cookie:</strong> keeps you signed in (up to 14 days for hosts, 8 hours for our team). Required for accounts.</li>
        <li><strong>Device cookie:</strong> a random identifier that lets us recognize a browser you&apos;ve signed in from before, so a sign-in from a new device can be checked more carefully. Kept up to 2 years.</li>
        <li><strong>Sign-in step cookies:</strong> short-lived (10 minutes) while you sign in with Google or GitHub or enter a sign-in code.</li>
        <li><strong>Analytics storage:</strong> PostHog stores an anonymous identifier in your browser to count visits.</li>
      </ul>

      <h2>2. How we use your data</h2>
      <ul>
        <li>To confirm bookings, send tickets, and check tickets at the event entrance.</li>
        <li>To create host accounts, verify hosts and the organizations behind their events, and review, publish and manage event listings.</li>
        <li>To keep people safe, including checking events that young people may attend.</li>
        <li>To keep the service and your account secure, including detecting unusual sign-ins.</li>
        <li>To answer your messages and send emails about your bookings, account or events. We don&apos;t send marketing emails without asking you first.</li>
        <li>To understand how the site is used and improve it.</li>
        <li>To meet legal obligations, and to have a record if an event is ever disputed.</li>
      </ul>
      <p>
        We rely on what you asked us to do (providing a booking or an account), our legitimate interest in running a safe,
        working service, your consent where we ask for it (for example, when you agree to us contacting the organizations
        you list), and legal obligations.
      </p>

      <h2>3. Who we share it with</h2>
      <p>We don&apos;t sell your personal data. We share it only with:</p>
      <ul>
        <li>
          <strong>Event hosts:</strong> hosts see how many people booked and checked in to their event. They don&apos;t
          receive attendees&apos; email addresses from us (they see only the VIP addresses they added themselves).
        </li>
        <li>
          <strong>Door staff:</strong> when your ticket is scanned at the entrance, staff using our check-in app see your ticket type and a partly hidden
          email address (for example j***@gmail.com), so they can match the ticket to you.
        </li>
        <li>
          <strong>The organizations a host lists:</strong> when verifying a host, we tell those organizations the host&apos;s
          name and the events concerned, to ask whether they&apos;re involved. Only confirmed sponsors&apos; names are shown
          on event pages.
        </li>
        <li>
          <strong>Service providers</strong> who run parts of DevEvent for us and may only use the data for that purpose:
          Vercel (hosting), MongoDB Atlas (database), Cloudinary (event image storage), Google (sending email through Gmail,
          Google sign-in, and the Gemini AI that hosts can use to create event images from their description and logo),
          GitHub (sign-in), PostHog (analytics) and Anthropic (AI that helps our team turn event request files into draft
          listings).
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
        <li>Sign-in and one-time codes and links: deleted when used or when they expire (10 minutes to 48 hours).</li>
        <li>Activity records: 12 months, then deleted automatically.</li>
        <li>Host accounts: until you close your account. When you do, your name and email are removed straight away; verification documents are kept for 12 months in case of a dispute, then deleted.</li>
        <li>Analytics: according to our analytics provider&apos;s retention settings.</li>
      </ul>

      <h2>6. How we protect it</h2>
      <p>
        Data is encrypted in transit (HTTPS). Passwords and one-time links are stored only as hashes, and identity documents
        are encrypted. Our team signs in with a password and an authenticator app, and unusual sign-ins need an extra emailed
        code. Access to personal data is limited to people who need it, and is recorded. No system is perfectly secure, so if a
        breach affects you, we&apos;ll tell you and the relevant authority as the law requires.
      </p>

      <h2>7. Your rights</h2>
      <p>You can ask us to:</p>
      <ul>
        <li>give you a copy of the personal data we hold about you;</li>
        <li>correct it if it&apos;s wrong;</li>
        <li>delete it, or cancel a booking (hosts can also close their account from Settings);</li>
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
        older to create a host account. Events that under-18s may attend need a named safeguarding contact and extra checks.
        If you think a child has given us personal data, contact us and we&apos;ll delete it.
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
