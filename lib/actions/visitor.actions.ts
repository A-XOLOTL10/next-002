"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { VISITOR_COOKIE } from "@/lib/session-cookies"

/** "Continue as visitor" on the login page: remember the choice for a year, then go home. */
export async function continueAsVisitor(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(VISITOR_COOKIE, "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect("/")
}
