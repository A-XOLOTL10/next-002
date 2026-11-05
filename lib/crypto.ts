import "server-only"
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto"

// Every cryptographic building block in one place, so each one is written (and reviewed) once.

/** SHA-256 hex digest. Used to store tokens: the database only ever sees the hash. */
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex")

/** A random, URL-safe secret (256 bits by default) for cookies and emailed links. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url")

/** A 6-digit code for emails ("042913"), from a cryptographically secure source. */
export const randomCode = (): string => String(randomInt(0, 1_000_000)).padStart(6, "0")

/** Constant-time string comparison: hashing first makes both sides the same length. */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest())
}

// ---------------------------------------------------------------- app secret (HMAC)

/** ADMIN_SESSION_SECRET signs values the browser holds (OAuth state, AI image grants). */
export function getAppSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < 32 || /[<>]/.test(secret)) {
    throw new Error("ADMIN_SESSION_SECRET must be a random value of at least 32 characters (not the placeholder text).")
  }
  return secret
}

/** A tamper-proof signature over `value`, scoped by `purpose` so one signature can't be reused for another. */
export const sign = (purpose: string, value: string): string =>
  createHmac("sha256", getAppSecret()).update(`${purpose}:${value}`).digest("base64url")

export const verifySignature = (purpose: string, value: string, signature: string): boolean => {
  try {
    return safeEqual(sign(purpose, value), signature)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- passwords (scrypt)

// scrypt is memory-hard, so guessing passwords on stolen hashes is slow even with GPUs.
// N=2^15 takes ~50-100 ms per check here: unnoticeable to a person, crippling to an attacker.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 }

const scryptAsync = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(password, salt, keyLength, options, (err, key) => (err ? reject(err) : resolve(key))))

/** "scrypt$N$r$p$salt$hash": the parameters travel with the hash, so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const { N, r, p, keyLength, maxmem } = SCRYPT
  const key = await scryptAsync(password.normalize("NFKC"), salt, keyLength, { N, r, p, maxmem })
  return ["scrypt", N, r, p, salt.toString("base64"), key.toString("base64")].join("$")
}

/** True if `password` matches `stored`. Never throws on a malformed hash; it just doesn't match. */
export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const parts = stored?.split("$")
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") {
    // Still do the work, so "no such account" takes as long as "wrong password".
    await scryptAsync(password, randomBytes(16), SCRYPT.keyLength, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem })
    return false
  }
  const [, N, r, p, salt, hash] = parts
  const expected = Buffer.from(hash, "base64")
  const key = await scryptAsync(password.normalize("NFKC"), Buffer.from(salt, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  })
  return key.length === expected.length && timingSafeEqual(key, expected)
}

// ---------------------------------------------------------------- document encryption (AES-256-GCM)

/** DOCUMENT_ENCRYPTION_KEY: 32 random bytes, base64. Losing it makes every stored document unreadable. */
function getDocumentKey(): Buffer {
  const raw = process.env.DOCUMENT_ENCRYPTION_KEY?.trim()
  const key = raw ? Buffer.from(raw, "base64") : null
  if (!key || key.length !== 32) {
    throw new Error("DOCUMENT_ENCRYPTION_KEY must be 32 random bytes in base64 (generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\").")
  }
  return key
}

export const documentEncryptionConfigured = (): boolean => {
  try {
    getDocumentKey()
    return true
  } catch {
    return false
  }
}

/** Encrypts bytes. GCM also authenticates them: any tampering makes decryption fail. */
export function encryptBytes(plain: Buffer): { iv: Buffer; authTag: Buffer; data: Buffer } {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", getDocumentKey(), iv)
  const data = Buffer.concat([cipher.update(plain), cipher.final()])
  return { iv, authTag: cipher.getAuthTag(), data }
}

export function decryptBytes({ iv, authTag, data }: { iv: Buffer; authTag: Buffer; data: Buffer }): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", getDocumentKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

/** Small secrets (the TOTP secret) as one string: iv.tag.data, all base64. */
export const encryptString = (value: string): string => {
  const { iv, authTag, data } = encryptBytes(Buffer.from(value, "utf8"))
  return [iv, authTag, data].map((b) => b.toString("base64")).join(".")
}

export const decryptString = (value: string): string => {
  const [iv, authTag, data] = value.split(".").map((part) => Buffer.from(part, "base64"))
  return decryptBytes({ iv, authTag, data }).toString("utf8")
}

// ---------------------------------------------------------------- authenticator app codes (TOTP, RFC 6238)

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

const base32Encode = (bytes: Buffer): string => {
  let bits = 0
  let value = 0
  let out = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

const base32Decode = (text: string): Buffer => {
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const char of text.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** A new authenticator secret (160 bits, base32, as authenticator apps expect). */
export const newTotpSecret = (): string => base32Encode(randomBytes(20))

/** The link an authenticator app reads from the QR code. */
export const totpUri = (secret: string, accountEmail: string): string =>
  `otpauth://totp/${encodeURIComponent(`DevEvent:${accountEmail}`)}?secret=${secret}&issuer=DevEvent&algorithm=SHA1&digits=6&period=30`

const TOTP_STEP_SECONDS = 30

function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, "0")
}

/**
 * Checks a 6-digit code, allowing one step either side for clock drift. Returns the matching
 * time step (so the caller can refuse the same code twice), or null.
 */
export function verifyTotp(secret: string, code: string, lastUsedStep?: number): number | null {
  const clean = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(clean)) return null
  const now = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS)
  for (const step of [now - 1, now, now + 1]) {
    if (lastUsedStep !== undefined && step <= lastUsedStep) continue // already used: a replayed code
    if (safeEqual(totpAt(secret, step), clean)) return step
  }
  return null
}

/** Ten one-time backup codes like "4k7q-m2x9", for when the phone is lost. */
export function newBackupCodes(): string[] {
  const alphabet = "23456789abcdefghjkmnpqrstuvwxyz"
  return Array.from({ length: 10 }, () => {
    let code = ""
    for (let i = 0; i < 8; i++) code += alphabet[randomInt(alphabet.length)]
    return `${code.slice(0, 4)}-${code.slice(4)}`
  })
}

export const normalizeBackupCode = (code: string): string => code.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
