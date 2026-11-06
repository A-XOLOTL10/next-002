import * as SecureStore from "expo-secure-store"
import { randomUUID } from "expo-crypto"
import type { Credential } from "@/lib/types"

// Everything secret lives in the phone's keychain/keystore, never in plain app storage.
// THIS_DEVICE_ONLY: not copied into backups or onto a new phone, so restoring a backup on
// another phone doesn't give that phone scanner access.

const OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
const CREDENTIAL_KEY = "devevent.credential"
const INSTALL_KEY = "devevent.installId"

export async function loadCredential(): Promise<Credential | null> {
  const raw = await SecureStore.getItemAsync(CREDENTIAL_KEY, OPTIONS)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Credential
    return parsed.token && parsed.device ? parsed : null
  } catch {
    return null
  }
}

export const saveCredential = (credential: Credential): Promise<void> => SecureStore.setItemAsync(CREDENTIAL_KEY, JSON.stringify(credential), OPTIONS)

export const clearCredential = (): Promise<void> => SecureStore.deleteItemAsync(CREDENTIAL_KEY, OPTIONS)

/**
 * A random ID for this install of the app. The server uses it to keep admin phones and staff
 * phones apart: a phone linked to an admin can't take a staff pass.
 */
export async function installId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_KEY, OPTIONS)
  if (existing) return existing
  const id = randomUUID()
  await SecureStore.setItemAsync(INSTALL_KEY, id, OPTIONS)
  return id
}
