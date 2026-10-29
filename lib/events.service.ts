import "server-only"
import mongoose from "mongoose"
import { revalidateTag } from "next/cache"
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"
import connectDB from "@/lib/mongodb"
import Event, { type IEvent } from "@/database/event.model"
import Booking from "@/database/booking.model"
import { EVENTS_TAG, bookingsTag, eventTag } from "@/lib/cache-tags"

// Create / update / delete events. Shared by the admin forms (Server Actions) and the
// API routes (Postman), so both validate, upload and invalidate caches the same way.
// Callers must check the admin session first; this module doesn't.

// ---------------------------------------------------------------- types

export type ServiceError = {
  ok: false
  status: 400 | 404 | 500
  message: string
  errors?: Record<string, string> // per-field messages, e.g. { title: "..." }
}
export type ServiceResult<T> = { ok: true; data: T } | ServiceError

/** An event as plain JSON (string _id), safe to return from APIs and Server Actions. */
export type EventRecord = Omit<IEvent, never> & { _id: string }

// ---------------------------------------------------------------- form parsing

const TEXT_FIELDS = [
  "title", "description", "overview", "venue", "location",
  "date", "time", "mode", "audience", "organizer",
] as const

// FormData has no arrays. Lists arrive as a JSON string ('["a","b"]'), as the same key
// repeated, or (from the admin form) as one text block. Agenda items can contain commas,
// so agenda splits on new lines only; tags split on commas or new lines.
const LIST_FIELDS = { agenda: /\r?\n/, tags: /[,\r\n]/ } as const

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

type EventFields = Partial<Record<(typeof TEXT_FIELDS)[number], string>> & { agenda?: string[]; tags?: string[] }
type ParsedForm = { fields: EventFields; image?: File }

const fail = (status: ServiceError["status"], message: string, errors?: Record<string, string>): ServiceError =>
  ({ ok: false, status, message, errors })

/** Returns undefined when the field wasn't sent at all (so updates leave it unchanged). */
function parseList(formData: FormData, key: keyof typeof LIST_FIELDS): string[] | undefined | Error {
  const values = formData.getAll(key).filter((v): v is string => typeof v === "string")
  if (values.length === 0) return undefined

  if (values.length === 1 && values[0].trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(values[0])
      if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
        return parsed.map((item) => item.trim()).filter(Boolean)
      }
    } catch {
      // fall through to the error below
    }
    return new Error(`${key} must be a JSON array of strings, e.g. ["one","two"]`)
  }

  return values.flatMap((v) => v.split(LIST_FIELDS[key])).map((item) => item.trim()).filter(Boolean)
}

function parseEventForm(formData: FormData): ParsedForm | ServiceError {
  const fields: EventFields = {}
  const errors: Record<string, string> = {}

  // Only known fields are read, so a request can't set slug, createdAt, etc.
  for (const key of TEXT_FIELDS) {
    const value = formData.get(key)
    if (typeof value === "string") fields[key] = value
  }

  for (const key of ["agenda", "tags"] as const) {
    const list = parseList(formData, key)
    if (list instanceof Error) errors[key] = list.message
    else if (list !== undefined) fields[key] = list
  }

  // An empty file input submits a 0-byte File: treat it as "no new image".
  let image: File | undefined
  const rawImage = formData.get("image")
  if (rawImage instanceof File && rawImage.size > 0) {
    if (!rawImage.type.startsWith("image/")) errors.image = "Image must be an image file (PNG, JPEG, WebP...)"
    else if (rawImage.size > MAX_IMAGE_BYTES) errors.image = "Image must be 5 MB or smaller"
    else image = rawImage
  } else if (typeof rawImage === "string" && rawImage.trim()) {
    errors.image = "Upload the image as a file (form-data type: File), not as text"
  }

  if (Object.keys(errors).length > 0) return fail(400, "Invalid event data", errors)
  return { fields, image }
}

// ---------------------------------------------------------------- helpers

function uploadImage(file: File): Promise<UploadApiResponse> {
  return file.arrayBuffer().then((arrayBuffer) =>
    new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ resource_type: "image", folder: "DevEvent" }, (error, result) => {
        if (error || !result) return reject(error ?? new Error("Cloudinary returned no result"))
        resolve(result)
      }).end(Buffer.from(arrayBuffer))
    }),
  )
}

/** Best-effort removal of an image we uploaded. Ignores non-Cloudinary URLs (e.g. /images/... samples). */
async function deleteCloudinaryImage(url: string): Promise<void> {
  const publicId = url.match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i)?.[1]
  if (!publicId) return
  await cloudinary.uploader.destroy(publicId).catch((e: unknown) => console.error("Image cleanup failed:", e))
}

/**
 * Expire cached reads immediately, so the next visit (including the admin's redirect
 * right after saving) shows the change. { expire: 0 } works from both Server Actions
 * and Route Handlers.
 */
function expireTags(...tags: string[]): void {
  for (const tag of tags) revalidateTag(tag, { expire: 0 })
}

function toRecord(doc: InstanceType<typeof Event>): EventRecord {
  const { _id, ...rest } = doc.toObject()
  return { ...rest, _id: _id.toString() }
}

/** Client mistakes become 400s with per-field messages; anything else is logged as a 500. */
function toServiceError(e: unknown, action: string): ServiceError {
  if (e instanceof mongoose.Error.ValidationError) {
    const errors = Object.fromEntries(Object.entries(e.errors).map(([path, err]) => [path, err.message]))
    return fail(400, "Event validation failed", errors)
  }
  if (e instanceof mongoose.Error.CastError) {
    return fail(400, `Invalid value for ${e.path}`)
  }
  console.error(`Event ${action} failed:`, e)
  return fail(500, `Event ${action} failed. Please try again.`)
}

const imageUploadsConfigured = (): boolean => Boolean(process.env.CLOUDINARY_URL)

// ---------------------------------------------------------------- operations

/** Create an event from form-data. The image file is required. */
export async function createEvent(formData: FormData): Promise<ServiceResult<EventRecord>> {
  const parsed = parseEventForm(formData)
  if ("ok" in parsed) return parsed
  if (!parsed.image) return fail(400, "Invalid event data", { image: "Image file is required" })
  if (!imageUploadsConfigured()) return fail(500, "Image uploads are not configured on the server (CLOUDINARY_URL)")

  let uploaded: UploadApiResponse | undefined
  try {
    await connectDB()

    // Values are checked by the schema (required, enum, date/time format) on validate/save.
    const event = new Event(parsed.fields as Partial<IEvent>)

    // Validate everything except the image first, so bad input doesn't upload an unused image.
    await event.validate({ pathsToSkip: ["image"] })

    uploaded = await uploadImage(parsed.image)
    event.image = uploaded.secure_url
    await event.save() // pre-save hook generates the slug and normalizes date/time

    expireTags(EVENTS_TAG, eventTag(event.slug)) // slug entry may hold a cached "not found"
    return { ok: true, data: toRecord(event) }
  } catch (e) {
    if (uploaded) await deleteCloudinaryImage(uploaded.secure_url)
    return toServiceError(e, "creation")
  }
}

/**
 * Update an event. Only the fields sent are changed (send just the ones you want to edit);
 * a new image file replaces the old image. Changing the title changes the slug.
 */
export async function updateEvent(slug: string, formData: FormData): Promise<ServiceResult<EventRecord>> {
  const parsed = parseEventForm(formData)
  if ("ok" in parsed) return parsed
  if (Object.keys(parsed.fields).length === 0 && !parsed.image) return fail(400, "Nothing to update: send at least one field")
  if (parsed.image && !imageUploadsConfigured()) return fail(500, "Image uploads are not configured on the server (CLOUDINARY_URL)")

  let uploaded: UploadApiResponse | undefined
  try {
    await connectDB()

    // Loaded as a document and saved with save(), so the pre-save hooks (slug, date/time) run.
    // findOneAndUpdate would skip them.
    const event = await Event.findOne({ slug: slug.toLowerCase() })
    if (!event) return fail(404, `Event "${slug}" not found`)

    const oldSlug = event.slug
    const oldImage = event.image

    event.set(parsed.fields as Partial<IEvent>)
    await event.validate()

    if (parsed.image) {
      uploaded = await uploadImage(parsed.image)
      event.image = uploaded.secure_url
    }
    await event.save()

    if (uploaded) await deleteCloudinaryImage(oldImage) // replaced: remove the old file
    expireTags(EVENTS_TAG, eventTag(oldSlug), eventTag(event.slug))
    return { ok: true, data: toRecord(event) }
  } catch (e) {
    if (uploaded) await deleteCloudinaryImage(uploaded.secure_url)
    return toServiceError(e, "update")
  }
}

/** Delete an event, its bookings and its uploaded image. */
export async function deleteEvent(slug: string): Promise<ServiceResult<{ slug: string; deletedBookings: number }>> {
  try {
    await connectDB()

    const event = await Event.findOne({ slug: slug.toLowerCase() })
    if (!event) return fail(404, `Event "${slug}" not found`)

    // Bookings first: if deleting the event then fails, a retry still finds it and finishes the job.
    const { deletedCount } = await Booking.deleteMany({ eventId: event._id })
    await event.deleteOne()
    await deleteCloudinaryImage(event.image)

    expireTags(EVENTS_TAG, eventTag(event.slug), bookingsTag(event._id.toString()))
    return { ok: true, data: { slug: event.slug, deletedBookings: deletedCount } }
  } catch (e) {
    return toServiceError(e, "deletion")
  }
}
