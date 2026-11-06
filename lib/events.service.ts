import "server-only"
import mongoose from "mongoose"
import { revalidateTag, updateTag } from "next/cache"
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary"
import connectDB from "@/lib/mongodb"
import Event, { type IEvent } from "@/database/event.model"
import Booking from "@/database/booking.model"
import { IMAGE_RULES, REQUIRED_TO_PUBLISH } from "@/database/event.constants"
import { EVENTS_TAG, bookingsTag, eventTag } from "@/lib/cache-tags"
import { hasEnded } from "@/lib/utils"

// Create / update / publish / delete events. Shared by the admin forms (Server Actions),
// the API routes (Postman) and the AI import, so all of them validate, upload and refresh
// caches the same way. Callers must check the admin session first; this module doesn't.
//
// Every new event starts as a draft. Visitors only see an event after an admin has
// previewed it and published it with the PIN (see publishEvents).

// ---------------------------------------------------------------- types

export type ServiceError = {
  ok: false
  status: 400 | 404 | 500
  message: string
  errors?: Record<string, string> // per-field messages, e.g. { title: "..." }
}
export type ServiceResult<T> = { ok: true; data: T } | ServiceError

/** An event as plain JSON (string _id), safe to return from APIs and Server Actions. */
export type EventRecord = IEvent & { _id: string }

export type PublishOutcome = {
  published: string[] // slugs
  failed: { slug: string; title: string; message: string; errors?: Record<string, string> }[]
}

// ---------------------------------------------------------------- form parsing

const TEXT_FIELDS = [
  "title", "description", "overview", "venue", "location", "date", "time",
  "endDate", "endTime", "timezone", "mode", "audience", "organizer", "imageDisplay", "category",
] as const

// FormData has no arrays. Lists arrive as a JSON string ('["a","b"]'), as the same key
// repeated, or (from the admin form) as one text block. Agenda items can contain commas,
// so agenda splits on new lines only; tags split on commas or new lines.
const LIST_FIELDS = { agenda: /\r?\n/, tags: /[,\r\n]/ } as const

type EventFields = Partial<Record<(typeof TEXT_FIELDS)[number], string>> & { agenda?: string[]; tags?: string[] }
export type ParsedForm = { fields: EventFields; newImages: File[]; removeImages: string[] }

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

export function parseEventForm(formData: FormData): ParsedForm | ServiceError {
  const fields: EventFields = {}
  const errors: Record<string, string> = {}

  // Only known fields are read, so a request can't set slug, status, createdAt, etc.
  for (const key of TEXT_FIELDS) {
    const value = formData.get(key)
    if (typeof value !== "string") continue
    // "Choose a mode" left unselected on a draft isn't a mode.
    if ((key === "mode" || key === "category") && !value.trim()) continue
    fields[key] = value
  }

  for (const key of ["agenda", "tags"] as const) {
    const list = parseList(formData, key)
    if (list instanceof Error) errors[key] = list.message
    else if (list !== undefined) fields[key] = list
  }

  // "images" is the form's field; "image" still works for existing Postman requests.
  // An empty file input submits a 0-byte File: treat it as "no new image".
  const rawImages = [...formData.getAll("images"), ...formData.getAll("image")]
  const newImages = rawImages.filter((v): v is File => v instanceof File && v.size > 0)
  if (rawImages.some((v) => typeof v === "string" && v.trim())) {
    errors.images = "Upload images as files (form-data type: File), not as text"
  }
  if (newImages.length > IMAGE_RULES.maxImages) errors.images = `Upload at most ${IMAGE_RULES.maxImages} images`
  if (newImages.some((file) => file.size > IMAGE_RULES.maxBytes)) errors.images = "Each image must be 5 MB or smaller"

  const removeImages = formData.getAll("removeImages").filter((v): v is string => typeof v === "string")

  if (Object.keys(errors).length > 0) return fail(400, "Invalid event data", errors)
  return { fields, newImages, removeImages }
}

/** Which fields stop this event being published. Empty when it's ready. */
export function findMissingFields(event: Partial<IEvent>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const key of REQUIRED_TO_PUBLISH) {
    const value = event[key]
    const isEmpty = Array.isArray(value) ? value.length === 0 : !value?.toString().trim()
    if (isEmpty) errors[key] = key === "images" ? "At least one image is required" : `${key} is required`
  }
  return errors
}

// ---------------------------------------------------------------- images

/** An image breaking the rules: the uploader's mistake (400), not a server failure. */
export class ImageRuleError extends Error {}

/**
 * The type from the file's first bytes, not the browser-reported type, which can say anything.
 * SVG is deliberately absent: it can carry scripts, and next/image refuses it by default.
 */
function detectImageType(bytes: Buffer): "png" | "jpeg" | "webp" | null {
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png"
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpeg"
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") return "webp"
  return null
}

/** Removes an uploaded image that's no longer needed. Ignores non-Cloudinary URLs (e.g. /images/... samples). */
export async function deleteCloudinaryImage(url: string): Promise<void> {
  const publicId = url.match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i)?.[1]
  if (!publicId) return
  await cloudinary.uploader.destroy(publicId).catch((e: unknown) => console.error("Image cleanup failed:", e))
}

/** Dimensions are only known after Cloudinary has read the image, so an undersized one is removed again. */
async function checkDimensions(result: UploadApiResponse, label: string): Promise<string> {
  if (result.width < IMAGE_RULES.minWidth || result.height < IMAGE_RULES.minHeight) {
    await deleteCloudinaryImage(result.secure_url)
    throw new ImageRuleError(
      `${label} is ${result.width} x ${result.height} pixels; images must be at least ${IMAGE_RULES.minWidth} x ${IMAGE_RULES.minHeight}`,
    )
  }
  return result.secure_url
}

/** Uploads one image file, returning its URL. Throws ImageRuleError if it breaks the rules. */
export async function uploadImageFile(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer())
  if (!detectImageType(bytes)) throw new ImageRuleError(`${file.name} isn't a valid image (${IMAGE_RULES.formats} only)`)

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    cloudinary.uploader.upload_stream({ resource_type: "image", folder: "DevEvent" }, (error, uploaded) => {
      if (error || !uploaded) return reject(error ?? new Error("Cloudinary returned no result"))
      resolve(uploaded)
    }).end(bytes)
  })
  return checkDimensions(result, file.name)
}

/**
 * Copies an image from a public URL (e.g. a link in an exported form). Cloudinary does the
 * fetching, so our server never opens URLs from uploaded files.
 */
export async function uploadImageFromUrl(url: string): Promise<string> {
  const driveId = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]+)/)?.[1]
  const source = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : url

  const result = await cloudinary.uploader.upload(source, { resource_type: "image", folder: "DevEvent" })
  if (!["png", "jpg", "jpeg", "webp"].includes(result.format)) {
    await deleteCloudinaryImage(result.secure_url)
    throw new ImageRuleError(`${url} isn't a ${IMAGE_RULES.formats} image`)
  }
  return checkDimensions(result, "This image")
}

/** Uploads several files; if any fails, removes the ones already uploaded. */
export async function uploadImageFiles(files: File[]): Promise<string[]> {
  const urls: string[] = []
  try {
    for (const file of files) urls.push(await uploadImageFile(file))
    return urls
  } catch (e) {
    await Promise.all(urls.map(deleteCloudinaryImage))
    throw e
  }
}

export const imageUploadsConfigured = (): boolean => Boolean(process.env.CLOUDINARY_URL)

// ---------------------------------------------------------------- helpers

/**
 * Expire cached reads immediately, so the next visit shows the change.
 *
 * From the admin forms (Server Actions), updateTag also clears these pages from the admin's
 * own browser cache; without it, "View visitor site" can show a copy from minutes ago.
 * updateTag only works in Server Actions and throws elsewhere, so for the API routes this
 * falls back to revalidateTag with { expire: 0 }, which refreshes the server's cache.
 */
export function expireTags(...tags: string[]): void {
  for (const tag of tags) {
    try {
      updateTag(tag)
    } catch {
      revalidateTag(tag, { expire: 0 })
    }
  }
}

function toRecord(doc: InstanceType<typeof Event>): EventRecord {
  const { _id, ...rest } = doc.toObject()
  return { ...rest, _id: _id.toString() }
}

/** Client mistakes become 400s with per-field messages; anything else is logged as a 500. */
export function toServiceError(e: unknown, action: string): ServiceError {
  if (e instanceof ImageRuleError) return fail(400, "Invalid event data", { images: e.message })
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

// ---------------------------------------------------------------- operations

/** Create a draft from the admin form or API. Everything is required here, including an image. */
export async function createEvent(formData: FormData): Promise<ServiceResult<EventRecord>> {
  const parsed = parseEventForm(formData)
  if ("ok" in parsed) return parsed
  if (parsed.newImages.length > 0 && !imageUploadsConfigured()) {
    return fail(500, "Image uploads are not configured on the server (CLOUDINARY_URL)")
  }

  // Values are checked by the schema (required, enum, date/time format) on validate/save.
  const candidate = { ...parsed.fields, images: parsed.newImages.map((file) => file.name) } as Partial<IEvent>
  const missing = findMissingFields(candidate)
  if (Object.keys(missing).length > 0) return fail(400, "Invalid event data", missing)

  let uploaded: string[] = []
  try {
    await connectDB()

    const event = new Event({ ...parsed.fields, status: "draft", source: "manual" } as Partial<IEvent>)

    // Validate everything else first, so bad input doesn't upload unused images.
    await event.validate()

    uploaded = await uploadImageFiles(parsed.newImages)
    event.images = uploaded
    await event.save() // pre-save hook generates the slug and normalizes date/time

    return { ok: true, data: toRecord(event) }
  } catch (e) {
    await Promise.all(uploaded.map(deleteCloudinaryImage))
    return toServiceError(e, "creation")
  }
}

/**
 * Update an event. Only the fields sent are changed (send just the ones you want to edit).
 * New image files are added, and URLs in `removeImages` are removed. A published event
 * keeps its slug, so shared links and links in emails keep working.
 */
export async function updateEvent(slug: string, formData: FormData): Promise<ServiceResult<EventRecord>> {
  const parsed = parseEventForm(formData)
  if ("ok" in parsed) return parsed
  const { fields, newImages, removeImages } = parsed
  if (Object.keys(fields).length === 0 && newImages.length === 0 && removeImages.length === 0) {
    return fail(400, "Nothing to update: send at least one field")
  }
  if (newImages.length > 0 && !imageUploadsConfigured()) {
    return fail(500, "Image uploads are not configured on the server (CLOUDINARY_URL)")
  }

  let uploaded: string[] = []
  try {
    await connectDB()

    // Loaded as a document and saved with save(), so the pre-save hooks (slug, date/time) run.
    // findOneAndUpdate would skip them.
    const event = await Event.findOne({ slug: slug.toLowerCase() })
    if (!event) return fail(404, `Event "${slug}" not found`)

    const previousSlug = event.slug
    const keptImages = event.images.filter((url) => !removeImages.includes(url))
    const removed = event.images.filter((url) => removeImages.includes(url))

    if (keptImages.length + newImages.length > IMAGE_RULES.maxImages) {
      return fail(400, "Invalid event data", { images: `An event can have at most ${IMAGE_RULES.maxImages} images` })
    }
    if (event.status === "published" && keptImages.length + newImages.length === 0) {
      return fail(400, "Invalid event data", { images: "A published event needs at least one image" })
    }

    event.set(fields as Partial<IEvent>)
    // File names stand in for the URLs until upload, so the image count validates first.
    event.images = [...keptImages, ...newImages.map((file) => file.name)]
    await event.validate()

    uploaded = await uploadImageFiles(newImages)
    event.images = [...keptImages, ...uploaded]
    await event.save()

    await Promise.all(removed.map(deleteCloudinaryImage))
    expireTags(EVENTS_TAG, eventTag(previousSlug), eventTag(event.slug))
    return { ok: true, data: toRecord(event) }
  } catch (e) {
    await Promise.all(uploaded.map(deleteCloudinaryImage))
    return toServiceError(e, "update")
  }
}

/**
 * Makes drafts visible to visitors. Each event is checked on its own, so one incomplete
 * draft doesn't stop the others. The caller must have verified the admin's PIN.
 */
export async function publishEvents(slugs: string[]): Promise<ServiceResult<PublishOutcome>> {
  const outcome: PublishOutcome = { published: [], failed: [] }

  try {
    await connectDB()
    const events = await Event.find({ slug: { $in: slugs } })

    for (const slug of slugs) {
      const event = events.find((candidate) => candidate.slug === slug)
      if (!event) {
        outcome.failed.push({ slug, title: slug, message: "Event not found" })
        continue
      }
      // Host events go live only through their own review (sponsor checks, signed letter), and
      // cancelled or rejected events can't be brought back by publishing them here.
      if (event.ownerId) {
        outcome.failed.push({ slug, title: event.title, message: "Host events are approved from Approvals" })
        continue
      }
      if (event.status !== "draft") {
        outcome.failed.push({ slug, title: event.title, message: event.status === "published" ? "Already live" : `Can't publish a ${event.status} event` })
        continue
      }

      const missing = findMissingFields(event.toObject())
      if (Object.keys(missing).length > 0) {
        outcome.failed.push({ slug, title: event.title, message: "Some details are missing", errors: missing })
        continue
      }
      if (hasEnded(event.endsAt)) {
        outcome.failed.push({ slug, title: event.title, message: "This event has already ended" })
        continue
      }

      try {
        event.status = "published"
        event.publishedAt = new Date()
        await event.save()
        expireTags(eventTag(event.slug))
        outcome.published.push(slug)
      } catch (e) {
        const error = toServiceError(e, "publish")
        outcome.failed.push({ slug, title: event.title, message: error.message, errors: error.errors })
      }
    }

    if (outcome.published.length > 0) expireTags(EVENTS_TAG)
    return { ok: true, data: outcome }
  } catch (e) {
    return toServiceError(e, "publish")
  }
}

/** Delete an event (or discard a draft), with its bookings and uploaded images. */
export async function deleteEvent(slug: string): Promise<ServiceResult<{ slug: string; deletedBookings: number }>> {
  try {
    await connectDB()

    const event = await Event.findOne({ slug: slug.toLowerCase() })
    if (!event) return fail(404, `Event "${slug}" not found`)

    // Bookings first: if deleting the event then fails, a retry still finds it and finishes the job.
    const { deletedCount } = await Booking.deleteMany({ eventId: event._id })
    await event.deleteOne()
    await Promise.all(event.images.map(deleteCloudinaryImage))

    expireTags(EVENTS_TAG, eventTag(event.slug), bookingsTag(event._id.toString()))
    return { ok: true, data: { slug: event.slug, deletedBookings: deletedCount } }
  } catch (e) {
    return toServiceError(e, "deletion")
  }
}
