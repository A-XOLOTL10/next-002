import * as LocalAuthentication from "expo-local-authentication"

// Admin access on a phone is locked behind the phone's own fingerprint, face or passcode, so an
// admin phone left on a desk (or handed over by mistake) can't be used to issue staff passes.

/** Whether the phone has a screen lock at all. Admin linking needs one. */
export async function phoneHasLock(): Promise<boolean> {
  return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE
}

/** Asks for the fingerprint, face or passcode. True only when the owner passed. */
export async function confirmOwner(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: "Cancel" })
  return result.success
}
