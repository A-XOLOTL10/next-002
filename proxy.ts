import { NextResponse, type NextRequest } from "next/server"
import { ADMIN_SESSION_COOKIE, VISITOR_COOKIE } from "@/lib/session-cookies"

// Entry gate for the home page only. Someone arriving at "/" for the first time is sent
// to the login page, where admins sign in and everyone else picks "Continue as visitor".
// After either choice they have a cookie, so "/" opens normally.
//
// This is a convenience redirect, not security: it only checks that a cookie exists.
// Admin pages, admin actions and admin API routes each verify the signed session
// themselves (lib/auth.ts). Event pages (/events/...) aren't gated, so shared links
// and links in emails always work.
export function proxy(request: NextRequest) {
  const hasChosen = request.cookies.has(ADMIN_SESSION_COOKIE) || request.cookies.has(VISITOR_COOKIE)
  if (hasChosen) return NextResponse.next()

  return NextResponse.redirect(new URL("/admin/login", request.url))
}

export const config = {
  matcher: "/",
}
