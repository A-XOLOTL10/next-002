import type { Metadata } from "next"
import Link from "next/link"
import LegalPage, { ContactLines } from "@/components/LegalPage"

export const metadata: Metadata = {
  title: "Terms and Conditions | DevEvent",
  description: "The rules for booking and hosting events on DevEvent.",
}

// Static page, linked from the footer and from the Google, GitHub and LinkedIn sign-in screens.
export default function TermsPage() {
  return (
    <LegalPage title="Terms and Conditions" updated="4 November 2026">
      <p>
        These terms apply to everyone who uses DevEvent at next-002.vercel.app: visitors, people who book events, and hosts
        who list events. By using DevEvent you agree to them. If you don&apos;t agree, please don&apos;t use the service.
        Our <Link href="/privacy">Privacy Policy</Link> explains how we handle personal data.
      </p>

      <h2>1. What DevEvent is</h2>
      <p>
        DevEvent is a platform for finding, listing and booking developer events such as hackathons, meetups and
        conferences. Unless an event says otherwise, it is run by its host, not by DevEvent. We review listings, but we
        don&apos;t control and aren&apos;t responsible for how an event is run.
      </p>

      <h2>2. Booking events</h2>
      <ul>
        <li>Booking is currently free. Each email address can book an event once.</li>
        <li>A booking only counts after you confirm it from the email we send. Unconfirmed bookings expire after 24 hours.</li>
        <li>
          Your ticket and its QR code are personal to you. Each ticket can be used to enter once, and the first scan counts.
          Don&apos;t share, copy, sell or transfer your ticket. A copied ticket will be refused once the original has been used.
        </li>
        <li>
          Hosts and venues may refuse entry under their own rules (for example capacity, safety or age limits) even with a
          valid ticket.
        </li>
        <li>
          Events can be changed, postponed or cancelled by their hosts. We&apos;ll try to let you know, but we aren&apos;t
          responsible for any costs you incur, such as travel.
        </li>
      </ul>

      <h2>3. Hosting events</h2>
      <ul>
        <li>You must be 18 or older and give accurate details about yourself and, if you host as a company, your company.</li>
        <li>
          Event information you give us must be accurate and lawful, and you must have the right to use every image and
          piece of content you send us.
        </li>
        <li>
          We review every event before it&apos;s published. We may ask for more information, edit listings for clarity or
          format, or refuse or remove a listing that breaks these terms or that we believe is misleading or unsafe.
        </li>
        <li>
          You&apos;re responsible for running your event safely and lawfully, and for honouring tickets issued for it.
        </li>
        <li>
          By sending us event content, you allow us to display, copy and adapt it to list and promote your event on
          DevEvent and its channels, for as long as the event is listed.
        </li>
      </ul>

      <h2>4. Accounts</h2>
      <ul>
        <li>Keep your sign-in details secure. You&apos;re responsible for activity on your account.</li>
        <li>Tell us straight away if you think someone else has used your account.</li>
        <li>We may suspend or close accounts that break these terms or put other users or the service at risk.</li>
      </ul>

      <h2>5. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>make fake or automated bookings, or book with email addresses that aren&apos;t yours;</li>
        <li>copy or forge tickets, or try to get into an event without a valid ticket;</li>
        <li>try to get around our security, rate limits or sign-in checks, or access accounts or areas that aren&apos;t yours;</li>
        <li>scrape the site, overload it, or upload malware;</li>
        <li>impersonate someone else or post content that is unlawful, misleading, hateful or infringes others&apos; rights.</li>
      </ul>

      <h2>6. Fees and paid features</h2>
      <p>
        Booking and hosting are free today. We may introduce fees later, for example to list an event for a number of
        days or to buy tickets for paid events. Prices, what&apos;s included and refund terms will be shown before you
        pay, and we won&apos;t charge you for anything you haven&apos;t agreed to.
      </p>

      <h2>7. Our content</h2>
      <p>
        The DevEvent name, logo, design and software belong to us or our licensors. You may use the site for its intended
        purpose but may not copy or reuse it otherwise without our permission.
      </p>

      <h2>8. Other services</h2>
      <p>
        DevEvent links to and uses other services, such as Google, GitHub and LinkedIn sign-in, maps and event websites.
        Their own terms and privacy policies apply when you use them.
      </p>

      <h2>9. Disclaimer</h2>
      <p>
        We work to keep DevEvent accurate and available, but we provide it &quot;as is&quot;. We don&apos;t guarantee it
        will always be available or error-free, or that event information supplied by hosts is correct.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the extent the law allows, DevEvent isn&apos;t liable for indirect or consequential losses, or for losses caused
        by events, hosts, venues or other users. Nothing in these terms limits liability that can&apos;t be limited by law.
      </p>

      <h2>11. Ending use</h2>
      <p>
        You can stop using DevEvent at any time and ask us to delete your account. We may suspend or end access for anyone
        who breaks these terms.
      </p>

      <h2>12. Changes to these terms</h2>
      <p>
        We may update these terms as DevEvent changes. We&apos;ll change the date at the top, and tell account holders by
        email about significant changes before they take effect. Continuing to use DevEvent after that means you accept
        the updated terms.
      </p>

      <h2>13. Governing law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria.</p>

      <h2>14. Contact us</h2>
      <ContactLines />
    </LegalPage>
  )
}
