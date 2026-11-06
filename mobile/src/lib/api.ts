import { Platform } from "react-native"
import * as Device from "expo-device"
import { installId } from "@/lib/storage"
import type { Credential, DeviceSummary, ScanResult, ScannerEvent, StaffDevice, StaffPass } from "@/lib/types"

// Calls to the website. The address is built into the app (EXPO_PUBLIC_API_URL when building,
// otherwise the live site), so a scanned code can never point the app at another server.

const configured = (process.env.EXPO_PUBLIC_API_URL || "https://next-002.vercel.app").replace(/\/+$/, "")
// HTTPS only, except a computer on the local network while developing.
export const API_URL = /^https:\/\//.test(configured) || __DEV__ ? configured : "https://next-002.vercel.app"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
  /** The server no longer accepts this phone (unlinked, expired, or its admin lost access). */
  get signedOut(): boolean {
    return this.status === 401
  }
}

async function request<T>(path: string, { token, method = "GET", body }: { token?: string; method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError("No connection to the server. Check the phone's internet and try again.", 0)
  }
  const data = (await res.json().catch(() => ({}))) as T & { message?: string }
  if (!res.ok) throw new ApiError(data.message || `The server answered ${res.status}.`, res.status)
  return data
}

/** Scanned an admin link code or a staff pass: becomes this phone's credential. */
export async function setUp(code: string): Promise<Credential> {
  const result = await request<{ token: string; device: DeviceSummary }>("/api/scanner/setup", {
    method: "POST",
    body: { code, installId: await installId(), deviceName: Device.deviceName ?? Device.modelName ?? "Phone", platform: Platform.OS },
  })
  return { token: result.token, device: result.device }
}

export const fetchMe = (token: string) => request<{ device: DeviceSummary; events: ScannerEvent[] }>("/api/scanner/me", { token })

export const unlink = (token: string) => request<{ message: string }>("/api/scanner/me", { token, method: "DELETE" })

export const lookup = (token: string, eventId: string, code: string) =>
  request<ScanResult>("/api/scanner/lookup", { token, method: "POST", body: { eventId, code } })

export const admit = (token: string, eventId: string, code: string) =>
  request<ScanResult>("/api/scanner/admit", { token, method: "POST", body: { eventId, code } })

export const createPass = (token: string, eventId: string, label: string, hours: number) =>
  request<StaffPass>("/api/scanner/passes", { token, method: "POST", body: { eventId, label, hours } })

export const staffDevices = (token: string, eventId: string) =>
  request<{ devices: StaffDevice[] }>(`/api/scanner/devices?eventId=${encodeURIComponent(eventId)}`, { token })

export const revokeDevice = (token: string, id: string) =>
  request<{ message: string }>(`/api/scanner/devices/${encodeURIComponent(id)}`, { token, method: "DELETE" })
