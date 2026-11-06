import "server-only"
import { createHash } from "node:crypto"
import type { OAuthProvider } from "@/database/user.constants"
import { siteUrl } from "@/lib/site-url"

// Google and GitHub sign-in (OAuth 2.0 authorization code flow with PKCE).
//
//   /api/oauth/google  -> Google's sign-in page -> /api/oauth/google/callback -> session
//
// The callback addresses must be registered exactly in each provider's console:
//   <NEXT_PUBLIC_BASE_URL>/api/oauth/google/callback   and   .../github/callback

export type OAuthProfile = {
  provider: OAuthProvider
  providerId: string
  email: string
  emailVerified: boolean
  name: string
  avatarUrl?: string
  /** Google Workspace domain: present only for company Google accounts. */
  workspaceDomain?: string
}

type ProviderConfig = {
  authorizeUrl: string
  tokenUrl: string
  scope: string
  clientId?: string
  clientSecret?: string
}

const PROVIDERS: Record<OAuthProvider, () => ProviderConfig> = {
  google: () => ({
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  }),
  github: () => ({
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // user:email lets us read the verified address even when it's hidden on the profile.
    scope: "read:user user:email",
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  }),
}

export const isOAuthProvider = (value: string): value is OAuthProvider => value === "google" || value === "github"

export const oauthConfigured = (provider: OAuthProvider): boolean => {
  const { clientId, clientSecret } = PROVIDERS[provider]()
  return Boolean(clientId && clientSecret)
}

/** The callback address, built from the configured site address (never from request headers). */
export function callbackUrl(provider: OAuthProvider): string {
  const base = siteUrl()
  if (!base) throw new Error("NEXT_PUBLIC_BASE_URL must be set for Google/GitHub sign-in.")
  return `${base}/api/oauth/${provider}/callback`
}

/** PKCE: the provider only sees the verifier's hash until the code exchange. */
export const pkceChallenge = (verifier: string): string => createHash("sha256").update(verifier).digest("base64url")

export function authorizationUrl(provider: OAuthProvider, { state, verifier }: { state: string; verifier: string }): string {
  const config = PROVIDERS[provider]()
  const params = new URLSearchParams({
    client_id: config.clientId ?? "",
    redirect_uri: callbackUrl(provider),
    response_type: "code",
    scope: config.scope,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  })
  if (provider === "google") params.set("prompt", "select_account") // let people pick which Google account
  if (provider === "github") params.set("allow_signup", "true")
  return `${config.authorizeUrl}?${params}`
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000), cache: "no-store" })
  if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`)
  return (await res.json()) as T
}

/** Swaps the one-time code for an access token, then reads who signed in. */
export async function fetchProfile(provider: OAuthProvider, { code, verifier }: { code: string; verifier: string }): Promise<OAuthProfile> {
  const config = PROVIDERS[provider]()
  const tokens = await fetchJson<{ access_token?: string; error?: string; error_description?: string }>(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: config.clientId ?? "",
      client_secret: config.clientSecret ?? "",
      code,
      code_verifier: verifier,
      redirect_uri: callbackUrl(provider),
      grant_type: "authorization_code",
    }),
  })
  if (!tokens.access_token) throw new Error(`No access token from ${provider}: ${tokens.error ?? "unknown error"} ${tokens.error_description ?? ""}`.trim())
  const auth = { Authorization: `Bearer ${tokens.access_token}` }

  if (provider === "google") {
    const info = await fetchJson<{ sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string; hd?: string }>(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: auth },
    )
    if (!info.email) throw new Error("Google didn't share an email address")
    return {
      provider,
      providerId: info.sub,
      email: info.email.toLowerCase(),
      emailVerified: info.email_verified === true,
      name: info.name?.trim() || info.email.split("@")[0],
      avatarUrl: info.picture,
      workspaceDomain: info.hd?.toLowerCase(),
    }
  }

  const headers = { ...auth, Accept: "application/vnd.github+json", "User-Agent": "DevEvent" }
  const [profile, emails] = await Promise.all([
    fetchJson<{ id: number; login: string; name?: string | null; avatar_url?: string }>("https://api.github.com/user", { headers }),
    fetchJson<{ email: string; primary: boolean; verified: boolean }[]>("https://api.github.com/user/emails", { headers }),
  ])
  // Only a verified address counts: GitHub lets anyone add an unverified one.
  const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified)
  return {
    provider,
    providerId: String(profile.id),
    email: (primary?.email ?? "").toLowerCase(),
    emailVerified: Boolean(primary),
    name: profile.name?.trim() || profile.login,
    avatarUrl: profile.avatar_url,
  }
}
