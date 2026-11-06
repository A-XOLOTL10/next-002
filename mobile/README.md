# DevEvent Scanner (mobile app)

The door app for DevEvent. It scans ticket QR codes (or a typed `DEV-XXXXXXXXXX` ticket ID),
shows at once whether the guest is **VIP** or **Regular** and which tag to hand them (from the
event's door tags), and admits the ticket. Bookings still happen only on the website.

Built with Expo SDK 58 (React Native 0.88, Expo Router). It talks to the website's
`/api/scanner/*` routes (`lib/scanner.ts` on the server).

## Run it

```bash
cd mobile
npm install
npx expo start            # then press a (Android) or i (iOS)
```

The camera, secure storage and biometrics are native modules, so use a **development build**
(`npx expo run:android` / `npx expo run:ios`, or `npx eas-cli@latest build --profile development`)
rather than Expo Go.

By default the app talks to `https://next-002.vercel.app`. To point it at another server (for
example your computer while developing), set it when starting:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo start
```

Release builds only accept `https://` addresses.

Checks: `npm run typecheck`.

## Build for phones

```bash
npx eas-cli@latest build --platform android   # an .apk/.aab for staff phones
npx eas-cli@latest build --platform ios
```

## Who uses it, and how they get access

| | Admin phone | Staff phone |
|---|---|---|
| Who | A super or supra admin, on **their own** phone | Door staff, on their phone |
| Set up by | Website: Console > Mobile app > authenticator code > scan the QR (5 min, one use) | Scanning a staff pass an admin shows them (10 min, one use) |
| Can | Check in any live event, make staff passes, see and sign out staff phones | Look up and admit tickets for **one** event |
| Sees guest emails | In full | Partly hidden (`j***@gmail.com`) |
| Lasts | 30 days | Until the event ends (+2 h), or 4/8/12 hours; at most 72 hours |
| Locked by | The phone's fingerprint, face or passcode (on opening, after 1 minute in the background, and before making a pass) | Nothing to lock: it can only scan |

### Security rules

- **No account settings in the app.** Passwords, emails and two-factor are only on the website,
  so nothing at the door can change them. A staff phone has no account at all.
- **Admin phones are never staff phones.** A phone linked to an admin is refused a staff pass,
  so admins hand out passes instead of their own phones. Linking needs a fresh authenticator code
  on the website, the phone must have a screen lock, and the owner confirms with it. The admin and
  the super admin are emailed whenever a phone is linked.
- **Cut off instantly.** Unlink any phone from the website (Console > Mobile app) or from an admin
  phone. Suspending or removing an admin also stops their phone and every staff pass they issued.
- **Setup codes work once** and expire in minutes; a photo of an old one is useless.
- **The tier comes from the server.** QR codes look the same for VIP and regular tickets, so editing
  a QR code can't make someone VIP. Each ticket can be admitted once, even if two phones scan it at
  the same moment.
- Tokens are stored in the phone's keychain/keystore, never copied to backups or a new phone.
  Every link, pass, admit and sign-out is in the website's activity log.
