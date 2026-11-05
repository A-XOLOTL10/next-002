// Cookie names shared by proxy.ts (which only checks the session cookie exists) and lib/auth.ts
// (which verifies it against the database). Plain constants, safe to import anywhere.

/** Signed-in browser: a random token whose hash is in the sessions collection. */
export const SESSION_COOKIE = "dev_session"

/** A random id for this browser, kept 2 years: a sign-in from a browser we haven't seen is checked harder. */
export const DEVICE_COOKIE = "dev_device"

/** A sign-in waiting for its second step (authenticator or emailed code). Lives 10 minutes. */
export const CHALLENGE_COOKIE = "dev_challenge"

/** Google/GitHub sign-in in progress: state and PKCE verifier, signed. Lives 10 minutes. */
export const OAUTH_COOKIE = "dev_oauth"

/** Pages under /host that work without signing in. Everything else under /host needs a session. */
export const PUBLIC_HOST_PATHS = [
  "/host/login",
  "/host/signup",
  "/host/verify-email",
  "/host/forgot-password",
  "/host/reset-password",
  "/host/accept-invite",
] as const
