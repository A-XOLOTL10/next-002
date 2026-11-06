"use server"

import { refresh } from "next/cache"
import { requireAdmin, requireUser, type CurrentSession } from "@/lib/auth"
import { isAdminRole } from "@/database/user.constants"
import { addVipGuests, removeVipGuest, saveDoorTags } from "@/lib/vip.service"

// VIP list actions, for hosts (their own events) and admins (any event). The service checks
// which events this account may touch; admins must also have their authenticator set up.

export type VipState = { ok?: boolean; message?: string } | null

const str = (formData: FormData, key: string, max: number): string => {
  const value = formData.get(key)
  return typeof value === "string" ? value.slice(0, max) : ""
}

async function staffSession(): Promise<CurrentSession> {
  const session = await requireUser()
  return isAdminRole(session.user.role) ? requireAdmin() : session
}

const finish = (result: { ok: boolean; message: string }): VipState => {
  if (result.ok) refresh()
  return result
}

export async function addVipGuestsAction(slug: string, _prev: VipState, formData: FormData): Promise<VipState> {
  return finish(await addVipGuests(await staffSession(), slug, str(formData, "emails", 40_000)))
}

export async function removeVipGuestAction(slug: string, email: string): Promise<VipState> {
  return finish(await removeVipGuest(await staffSession(), slug, email))
}

export async function saveDoorTagsAction(slug: string, _prev: VipState, formData: FormData): Promise<VipState> {
  return finish(await saveDoorTags(await staffSession(), slug, { regular: str(formData, "regular", 100), vip: str(formData, "vip", 100) }))
}
