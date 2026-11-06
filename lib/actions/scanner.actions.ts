"use server"

import { refresh } from "next/cache"
import { actorOf, requireAdmin } from "@/lib/auth"
import { createDeviceLinkCode, createStaffPass, revokeDevice, revokeStaffDevices } from "@/lib/scanner"

// The website side of the scanner app (Console > Mobile app). Admins only.

export type ScannerState = { ok?: boolean; message?: string; data?: Record<string, unknown> } | null

const str = (formData: FormData, key: string, max: number): string => {
  const value = formData.get(key)
  return typeof value === "string" ? value.slice(0, max) : ""
}

async function adminActor() {
  const session = await requireAdmin()
  return actorOf(session)!
}

/** A one-time QR code that links the admin's own phone. Needs a fresh authenticator code. */
export async function createLinkCodeAction(_prev: ScannerState, formData: FormData): Promise<ScannerState> {
  const result = await createDeviceLinkCode(await adminActor(), str(formData, "code", 12))
  if (!result.ok) return { message: result.message }
  return { ok: true, data: { qr: result.code.qr, expiresAt: result.code.expiresAt } }
}

/** A one-time staff pass QR code for one event. */
export async function createStaffPassAction(_prev: ScannerState, formData: FormData): Promise<ScannerState> {
  const result = await createStaffPass(await adminActor(), { eventId: str(formData, "eventId", 30), label: str(formData, "label", 80), hours: Number(str(formData, "hours", 3)) })
  if (!result.ok) return { message: result.message }
  return { ok: true, data: { qr: result.code.qr, expiresAt: result.code.expiresAt, deviceExpiresAt: result.deviceExpiresAt, eventTitle: result.eventTitle, label: str(formData, "label", 80).trim() } }
}

export async function revokeDeviceAction(deviceId: string): Promise<ScannerState> {
  const result = await revokeDevice(await adminActor(), deviceId)
  if (!result.ok) return { message: result.message }
  refresh()
  return { ok: true, message: "Unlinked." }
}

export async function revokeAllStaffAction(): Promise<ScannerState> {
  const count = await revokeStaffDevices(await adminActor())
  refresh()
  return { ok: true, message: `${count} staff phone(s) signed out.` }
}
