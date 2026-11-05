import { NextResponse, type NextRequest } from "next/server"
import { PUBLIC_HOST_PATHS, SESSION_COOKIE } from "@/lib/session-cookies"

// First gate for the host area, run before any page is rendered or sent.
//
// Someone without a session cookie who opens a protected /host page is redirected to the
// sign-in page here, so not even the page's outline reaches their browser (this is what stops
// the dashboard flashing up before the login page). The cookie is only checked for presence:
// the real check (is the session valid, is the account active, which role) happens on the page
// itself (lib/auth.ts), behind a "Checking your session..." loader.
//
// Everything outside /host (home, events, bookings) is public and never passes through here.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const isPublic = PUBLIC_HOST_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  if (isPublic || request.cookies.has(SESSION_COOKIE)) return NextResponse.next()

  const login = new URL("/host/login", request.url)
  // Come back here after signing in (only /host paths are honoured; see landingFor in lib/auth.ts).
  if (pathname !== "/host") login.searchParams.set("next", `${pathname}${search}`)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ["/host", "/host/:path*"],
}
