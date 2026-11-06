// The site's public address, for links in emails, ticket QR codes and Google/GitHub sign-in.
//
// Normally this is NEXT_PUBLIC_BASE_URL. A common slip is copying .env.local to Vercel unchanged,
// which leaves it as http://localhost:3000: every sign-in then fails with "redirect URI mismatch"
// and emailed links point at the visitor's own computer. So on a Vercel deployment, a localhost
// (or missing) value is replaced with the deployment's real address, and a warning is logged.

let warned = false

export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/+$/, "") || ""
  const pointsAtLocalhost = !configured || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured)

  if (process.env.VERCEL === "1" && pointsAtLocalhost) {
    // Production: the project's main domain. Previews: that preview's own address.
    const host = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL
    if (host) {
      if (!warned) {
        warned = true
        console.warn(`NEXT_PUBLIC_BASE_URL is "${configured || "(not set)"}" on Vercel; using https://${host} instead. Set it in Vercel and redeploy.`)
      }
      return `https://${host}`
    }
  }
  return configured
}
