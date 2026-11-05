import type { ReactNode } from "react"
import { oauthConfigured } from "@/lib/oauth"

/** Centered column used by every sign-in page. */
export const AuthShell = ({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) => (
  <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-3xl font-bold">{title}</h1>
      {intro && <p className="text-light-100 text-sm">{intro}</p>}
    </div>
    {children}
  </div>
)

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.7 0 9.4-4 9.4-9.6 0-.6-.1-1.1-.2-1.6H12z" />
  </svg>
)

const GitHubIcon = () => (
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
    <path d="M12 .5C5.6.5.5 5.6.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 23.5 12C23.5 5.6 18.4.5 12 .5z" />
  </svg>
)

/**
 * "Continue with Google / GitHub". Plain links (full page loads), because the browser leaves
 * the site for the provider's sign-in page. Hidden when that provider isn't configured.
 */
export function OAuthButtons({ next }: { next?: string }) {
  const query = next ? `?next=${encodeURIComponent(next)}` : ""
  const providers = [
    { id: "google" as const, label: "Continue with Google", icon: <GoogleIcon /> },
    { id: "github" as const, label: "Continue with GitHub", icon: <GitHubIcon /> },
  ].filter((p) => oauthConfigured(p.id))
  if (providers.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {providers.map((p) => (
        <a
          key={p.id}
          href={`/api/oauth/${p.id}${query}`}
          className="bg-dark-100 border-dark-200 hover:border-primary flex items-center justify-center gap-3 rounded-[6px] border px-4 py-2.5 font-semibold transition-colors"
        >
          {p.icon}
          {p.label}
        </a>
      ))}
      <div className="text-light-200 flex items-center gap-3 text-xs">
        <span className="bg-dark-200 h-px flex-1" />
        or use your email
        <span className="bg-dark-200 h-px flex-1" />
      </div>
    </div>
  )
}
