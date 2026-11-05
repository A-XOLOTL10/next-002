import "server-only"
import type { Types } from "mongoose"
import PrivateFile, { type FilePurpose } from "@/database/private-file.model"
import { DOCUMENT_RULES } from "@/database/user.constants"
import { decryptBytes, documentEncryptionConfigured, encryptBytes, sha256 } from "@/lib/crypto"

// Sensitive uploads (IDs, company papers, signed letters): checked, encrypted, stored privately.
// See database/private-file.model.ts for why these never go to Cloudinary.

export class DocumentError extends Error {}

type DocType = "application/pdf" | "image/png" | "image/jpeg"

/** The real file type from its first bytes. The browser's claimed type can say anything. */
function sniff(bytes: Buffer): DocType | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") return "application/pdf"
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "image/png"
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg"
  return null
}

/**
 * Removes the EXIF block from a JPEG (it can hold the GPS position where a photo was taken).
 * Walks the JPEG segments and drops APP1 ("Exif") ones; anything unexpected returns the file
 * unchanged rather than risking a corrupted image.
 */
function stripJpegExif(bytes: Buffer): Buffer {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const parts: Buffer[] = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return bytes
    const marker = bytes[offset + 1]
    // Start of scan: the image data follows; copy the rest as is.
    if (marker === 0xda) {
      parts.push(bytes.subarray(offset))
      return Buffer.concat(parts)
    }
    const length = bytes.readUInt16BE(offset + 2)
    if (length < 2 || offset + 2 + length > bytes.length) return bytes
    const segment = bytes.subarray(offset, offset + 2 + length)
    const isExif = marker === 0xe1 && segment.subarray(4, 10).toString("latin1").startsWith("Exif")
    if (!isExif) parts.push(segment)
    offset += 2 + length
  }
  return bytes
}

/** Validates, cleans, encrypts and stores one uploaded document. Returns its id. */
export async function storePrivateFile(file: File, ownerId: Types.ObjectId | string, purpose: FilePurpose): Promise<Types.ObjectId> {
  if (!documentEncryptionConfigured()) throw new DocumentError("Document uploads aren't set up on the server yet (DOCUMENT_ENCRYPTION_KEY).")
  if (file.size === 0) throw new DocumentError(`${file.name} is empty.`)
  if (file.size > DOCUMENT_RULES.maxBytes) throw new DocumentError(`${file.name} is over ${DOCUMENT_RULES.maxBytes / 1024 / 1024} MB.`)

  let bytes: Buffer = Buffer.from(await file.arrayBuffer())
  const type = sniff(bytes)
  if (!type) throw new DocumentError(`${file.name} isn't a ${DOCUMENT_RULES.formats} file.`)
  if (type === "image/jpeg") bytes = stripJpegExif(bytes)

  const { iv, authTag, data } = encryptBytes(bytes)
  const doc = await PrivateFile.create({
    ownerId,
    purpose,
    filename: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 200) || "document",
    contentType: type,
    size: bytes.length,
    sha256: sha256(bytes),
    iv,
    authTag,
    data,
  })
  return doc._id
}

/** .lean() returns MongoDB Binary objects for Buffer fields; crypto needs real Buffers. */
const toBuffer = (value: unknown): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from((value as { buffer: ArrayBufferLike | Uint8Array }).buffer as Uint8Array)

/** The decrypted bytes and metadata, for the admin-only download route. */
export async function readPrivateFile(id: string): Promise<{ filename: string; contentType: DocType; bytes: Buffer; ownerId: string; purpose: FilePurpose } | null> {
  if (!/^[a-f\d]{24}$/i.test(id)) return null
  const doc = await PrivateFile.findById(id).select("+data").lean()
  if (!doc) return null
  return {
    filename: doc.filename,
    contentType: doc.contentType,
    bytes: decryptBytes({ iv: toBuffer(doc.iv), authTag: toBuffer(doc.authTag), data: toBuffer(doc.data) }),
    ownerId: doc.ownerId.toString(),
    purpose: doc.purpose,
  }
}

/** Other accounts that uploaded exactly the same document (a sign of reused or shared IDs). */
export async function findDuplicateUploads(fileIds: Types.ObjectId[], ownerId: Types.ObjectId | string): Promise<number> {
  if (fileIds.length === 0) return 0
  const hashes = await PrivateFile.find({ _id: { $in: fileIds } }).select("sha256").lean()
  const owners = await PrivateFile.distinct("ownerId", { sha256: { $in: hashes.map((h) => h.sha256) }, ownerId: { $ne: ownerId } })
  return owners.length
}
