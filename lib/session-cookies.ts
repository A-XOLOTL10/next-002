// Cookie names shared by proxy.ts (which only checks they exist) and lib/auth.ts
// (which verifies the admin session properly). Plain constants, safe to import anywhere.

/** Signed admin session: "<expiresAtMs>.<signature>". */
export const ADMIN_SESSION_COOKIE = "admin_session"

/** Set when someone picks "Continue as visitor" on the login page. Not a secret. */
export const VISITOR_COOKIE = "visitor"
