# DevEvent admin guide

For the people who run DevEvent: the super admin and supra admins. It covers signing in, verifying hosts, reviewing events, the activity log, and what to do when something goes wrong.

## Roles

| Role | Who | Can do |
|---|---|---|
| **Super admin** | One person (the account in `ADMIN_EMAIL` when the site was first set up) | Everything below, plus: invite, suspend and remove supra admins; read and export the activity log |
| **Supra admin** | Team members the super admin invites | Verify hosts, review and publish events, approve changes, handle reports, check tickets in, create events, AI import |
| **Host** | Companies and organizers | Create events once verified; see booking counts; check in tickets for their own events |

Supra admins can't see or change the super admin's account, can't manage the team, and can't read the log. Nobody can approve their own host account or their own event.

## Signing in

There's one sign-in page for everyone: **/host** (the "Host" link in the menu). After signing in, team accounts go to the console at **/host/console**; hosts go to their dashboard. Hosts who open the console are sent back to their dashboard.

Every team sign-in needs:

1. **Your password.**
2. **A 6-digit code from your authenticator app** (Google Authenticator, Microsoft Authenticator, 1Password). You set this up on the **Security** page the first time you sign in; the console stays locked until you do. Keep the 10 backup codes somewhere safe: each works once if you lose your phone.
3. **An emailed 6-digit code** when you sign in from a **new device or a new country**. The super admin and you both get an email when this happens.

Sessions end after **8 hours**, or **30 minutes** without activity. Five wrong passwords from one network lock sign-in for 15 minutes; ten for one account from anywhere also locks it.

### First-time setup (super admin)

1. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in Vercel and deploy.
2. Sign in at /host with those details. This creates the super admin account in the database (only if none exists yet).
3. Enter the emailed code, set up the authenticator app, and if asked, choose a new password of at least 12 characters.
4. **Remove `ADMIN_PASSWORD` from Vercel.** From now on the database account is the only one that counts; changing the env vars does nothing.

### Lost access

- **Lost phone:** sign in with a backup code instead of the app code, then make new backup codes on the Security page.
- **Forgot password:** use "Forgot your password?" on the sign-in page. Every device is signed out when it changes.
- **Super admin locked out completely** (no phone and no backup codes): someone with access to the MongoDB database must clear `totpSecretEncrypted`, `totpEnabledAt` and `backupCodeHashes` on the super admin's document in the `users` collection. There's deliberately no web page that can do this.

## Verifying hosts (Approvals → Hosts to verify)

Hosts are promised about **10 minutes during working hours (9am to 6pm WAT, Monday to Friday)**. The queue shows how long each request has waited: amber after 5 minutes, red after 10. Hosts see "taking longer than usual" after 10 minutes. Outside working hours they're told it may take longer.

Open a request. You'll see the host's details, their documents (opening one is logged), warning signs (same registration number or same document on another account, a company signing up with a personal email), and one card per organization.

For **each organization**, call or email the contact and record the result:

- **They confirmed**: they know about and support the host's events.
- **They denied it**: they say they're not involved. Write who you spoke to and what they said.
- **No answer**: after 2 unanswered attempts the organization is marked unreachable. Use **Ask for more information** so the host can give another contact.
- **Add note**: anything else worth keeping.

Then decide:

- **Approve host** (only once every organization is confirmed). The host can create events.
- **Ask for more information**: the host is emailed your note and can edit and resend.
- **Deny** (only once an organization has denied): the host is emailed which organization didn't confirm, and may respond once. A second denial is final.
- **Reject for good**: final; they can't resubmit.
- **Suspend** (approved hosts): all their live events are cancelled and attendees emailed.
- **Reinstate**: they can create events again (cancelled events stay cancelled).

## Reviewing events (Approvals → Events to review)

The review page shows the event exactly as visitors will see it, plus what's behind it: each sponsor's check result, the event contact, the audience age, the safeguarding contact (needed whenever under-18s may attend; confirm the venue is public), and the signed CEO letter.

- **Approve and publish** needs your **publish PIN** and unlocks only when every sponsor is confirmed and nothing is missing. The exact approved content is fingerprinted into the log.
- **Ask for changes** sends it back to the host with your note.
- **Reject** is final.

**Changes to live events** (Approvals → Changes to live events) show the current and proposed values side by side. Visitors keep seeing the approved version until you approve. If the date, time, place or format changes, everyone who booked is emailed automatically.

**Reports from visitors** can be dismissed (with a note) or acted on by cancelling the event, which emails everyone who booked.

Events the team creates itself (Events → Create event, or AI Import) go through **Drafts** and the **publish PIN** as before.

## Check-in

Each ticket's QR code opens **/t/DEV-XXXXXXXXXX**. A signed-in team member (or the event's own host) lands on the check-in page and presses **Admit**. Each ticket works once; a second scan shows when it was used. You can also type the ticket ID on the Check-in page. Hosts can only see tickets for their own events.

Every check-in shows **VIP** or **Regular** in large type, and the door tag to hand over.

### VIP guests and door tags

On a live event, **VIP guests & door tags** (hosts: on their dashboard; admins: on the event's bookings page):

- **Door tags**: what staff hand out to each kind of guest, e.g. "Blue wristband" and "Gold lanyard". Shown after every scan.
- **Add VIP guests**: paste email addresses. Each person is emailed a VIP ticket straight away (same QR code and DEV- ID as any ticket; no booking needed). Someone who already booked keeps the same ticket, now marked VIP. Limits: 100 at a time, 300 per event.
- **Remove**: a ticket that only existed because of the VIP invite is cancelled; someone who booked themselves keeps a regular ticket.

### The DevEvent Scanner app (Console → Mobile app)

The phone app for the door (source and build steps in `mobile/README.md`).

1. **Link your own phone**: enter your authenticator code on the Mobile app page, then scan the QR code with the app ("I'm an admin"). The code works once, for 5 minutes. Your phone needs a screen lock, and the app asks for your fingerprint, face or passcode when it opens, after a minute in the background, and before making a staff pass. You and the super admin are emailed when a phone is linked. It lasts 30 days.
2. **Give door staff a pass**: choose the event and who it's for, then show the QR code to the staff member, who scans it with **their** phone ("I'm door staff"). Do this on the website or from your linked phone (Menu → Give a staff member a pass). A staff phone can only look up and admit tickets for that one event, sees emails partly hidden, and has no account or settings. It stops when the pass runs out (default: 2 hours after the event ends).
3. **Never hand your own phone to staff.** A phone linked to an admin is refused a staff pass.
4. **Lost a phone?** Unlink it under **Linked phones** (or "Sign out all staff phones"). It stops at its next scan. Suspending or removing an admin also stops their phone and every staff pass they made.

## The activity log (super admin)

**Activity log** in the console. Everything is dated and kept **12 months**, then deleted automatically. Entries can't be edited.

- **Category buttons**: Sign-in, Events, Bookings & check-in, Host verification, Admin team, Pages & clicks, Security.
- **Severity buttons**: info, warning (failed sign-in, wrong PIN), critical (deletions, suspensions, approvals of hosts, unusual sign-ins).
- **Date buttons**: Today, Yesterday, Last 7 days, Last 30 days, This month, or a custom From/To.
- **Person** and **Search** (event, ticket ID, email, IP).
- **Active time** per admin for the chosen dates (counted only while the console tab is visible and in use).
- **Export CSV** uses the same filters; the export itself is logged.

Each entry opens to show who, what, from which IP and device, the target, and for approvals the fingerprint of the exact content approved. Entries marked "from browser" are page views and clicks reported by the browser; important actions are always recorded by the server.

## Settings the site needs (Vercel → Settings → Environment Variables)

| Setting | What it's for |
|---|---|
| `MONGODB_URI` | The database. Atlas Network Access must allow Vercel (`0.0.0.0/0`). |
| `NEXT_PUBLIC_BASE_URL` | `https://next-002.vercel.app`. Links in emails, QR codes and sign-in callbacks. Redeploy after changing it. |
| `ADMIN_SESSION_SECRET` | 32+ random characters. Signs sign-in steps and AI image grants. |
| `DOCUMENT_ENCRYPTION_KEY` | Encrypts ID and company documents. **Never change or lose it** once documents exist, or they can't be opened. |
| `ADMIN_PUBLISH_PIN` | Required to publish anything. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Only for creating the super admin the first time. Remove the password afterwards. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` | Email (Gmail with an app password). Without it, unusual admin sign-ins are refused in production. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | "Continue with Google/GitHub". Callback: `<base URL>/api/oauth/google/callback` and `/github/callback`. |
| `GEMINI_API_KEY` (optional `GEMINI_IMAGE_MODEL`) | AI images for hosts. Without it the AI panel is hidden. |
| `ANTHROPIC_API_KEY` | AI import of event request forms. |
| `CLOUDINARY_URL` | Event images. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, `NEXT_PUBLIC_POSTHOG_HOST` | Analytics. |

## Good habits

- Turn on two-factor sign-in for Vercel, GitHub, MongoDB Atlas, Cloudinary and the Gmail account: whoever controls those controls the site.
- Don't share accounts. Each person has their own, so the log shows who did what.
- Always write a real reason when denying, rejecting, suspending or cancelling: the host (or attendees) see it, and it's your record if the decision is ever questioned.
