import { randomBytes } from "node:crypto";
import mongoose, { Schema, model, models, mongo, type Model, type Types } from "mongoose";
import {
  AUDIENCE_AGES,
  type AudienceAge,
  EVENT_CATEGORIES,
  type EventCategory,
  DEFAULT_TIMEZONE,
  EVENT_MODES,
  EVENT_SOURCES,
  EVENT_STATUSES,
  IMAGE_DISPLAYS,
  IMAGE_RULES,
  type EventMode,
  type EventSource,
  type EventStatus,
  type ImageDisplay,
} from "./event.constants";
import { computeEventTimes, isValidTimezone } from "./event-time";

export { EVENT_MODES, type EventMode };

export interface IEvent {
  title: string;
  slug: string;
  description: string;
  overview: string;
  image: string; // the main image: always images[0]
  images: string[]; // 1 to 5 designs for this event
  imageDisplay: ImageDisplay;
  venue: string;
  location: string;
  date: string; // ISO date, YYYY-MM-DD
  time: string; // start, 24-hour HH:mm
  endDate?: string; // last day, for multi-day events; defaults to `date`
  endTime: string; // finish, 24-hour HH:mm
  timezone: string; // IANA, e.g. Africa/Lagos
  mode: EventMode;
  /** The kind of event; also picks the design brief for AI images (lib/design-categories.ts). */
  category?: EventCategory;
  audience: string;
  agenda: string[];
  organizer: string;
  tags: string[];
  status: EventStatus;
  source: EventSource;
  importNotes: string[]; // what the AI import wants the admin to check
  publishedAt?: Date;
  // ---- host-created events (absent on events an admin created) ----
  ownerId?: Types.ObjectId; // the host's user id
  /** Who the admin calls about this event. Never shown to visitors. */
  hostContact?: { name: string; phone: string; email: string };
  /** Companies/sponsors behind the event (organizations from the host's verification file). */
  sponsors: { orgId: Types.ObjectId; name: string; confirmed: boolean }[];
  audienceAge?: AudienceAge;
  /** Required when under-18s may attend: who is responsible for their safety on the day. */
  safeguardingContact?: { name: string; phone: string };
  /** The signed letter from the company's CEO approving the event (a PrivateFile id). */
  authorizationLetterId?: Types.ObjectId;
  review?: { submittedAt?: Date; reviewedAt?: Date; reviewedBy?: Types.ObjectId; reviewedByName?: string; reason?: string };
  /** SHA-256 of exactly what an admin approved, also recorded in the activity log. */
  approvedSnapshotHash?: string;
  cancelledAt?: Date;
  cancelReason?: string;
  /** What door staff hand out per ticket tier ("Blue wristband", "Gold badge"). Internal only. */
  doorTags?: { regular?: string; vip?: string };
  // Exact moments, computed from the local date/time/timezone on save, so events can be
  // sorted and filtered in the database.
  startsAt?: Date;
  endsAt?: Date;
  hideAt?: Date; // midnight after the last day: visitors no longer see the event
  createdAt: Date;
  updatedAt: Date;
}

/** True for MongoDB's E11000 unique-index violation. */
export const isDuplicateKeyError = (error: Error): boolean =>
  error instanceof mongo.MongoServerError && error.code === 11000;

/**
 * Builds a standard Mongoose ValidationError so callers can handle every
 * client-side mistake with a single `error.name === "ValidationError"` check.
 */
export function validationError(
  path: string,
  message: string,
  value: unknown,
): mongoose.Error.ValidationError {
  const error = new mongoose.Error.ValidationError();
  error.addError(path, new mongoose.Error.ValidatorError({ path, message, value }));
  return error;
}

// Drafts can be incomplete (the AI import may not find everything), so these are only
// required once an event is published. `trim` turns whitespace-only values into empty ones.
function isPublished(this: unknown): boolean {
  return (this as IEvent).status === "published";
}
const publishedString = {
  type: String,
  trim: true,
  required: [isPublished, "{PATH} is required"] as [() => boolean, string],
};

// Mongoose defaults arrays to [], so `required` alone never fails; enforce at least one non-empty item.
const publishedStringArray = {
  type: [String],
  validate: {
    validator(this: unknown, items: string[]): boolean {
      if (!isPublished.call(this) && items.length === 0) return true;
      return items.length > 0 && items.every((item) => item.trim().length > 0);
    },
    message: "{PATH} must contain at least one non-empty item",
  },
};

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, lowercase: true, trim: true },
    description: publishedString,
    overview: publishedString,
    image: publishedString,
    images: {
      type: [String],
      validate: {
        validator(this: unknown, items: string[]): boolean {
          if (items.length > IMAGE_RULES.maxImages) return false;
          return !isPublished.call(this) || items.length > 0;
        },
        message: `An event needs between 1 and ${IMAGE_RULES.maxImages} images`,
      },
    },
    imageDisplay: { type: String, enum: IMAGE_DISPLAYS, default: "static" },
    venue: publishedString,
    location: publishedString,
    date: publishedString,
    time: publishedString,
    endDate: { type: String, trim: true },
    endTime: publishedString,
    timezone: {
      type: String,
      trim: true,
      default: DEFAULT_TIMEZONE,
      validate: { validator: isValidTimezone, message: "{VALUE} is not a valid timezone" },
    },
    mode: { ...publishedString, lowercase: true, enum: EVENT_MODES },
    // Optional for older and admin-created events; required when a host sends an event for review.
    category: { type: String, enum: EVENT_CATEGORIES },
    audience: publishedString,
    agenda: publishedStringArray,
    organizer: publishedString,
    tags: publishedStringArray,
    status: { type: String, enum: EVENT_STATUSES, required: true, default: "draft" },
    source: { type: String, enum: EVENT_SOURCES, default: "manual" },
    importNotes: { type: [String], default: [] },
    publishedAt: { type: Date },
    ownerId: { type: Schema.Types.ObjectId, ref: "User" },
    hostContact: new Schema(
      {
        name: { type: String, trim: true, maxlength: 120 },
        phone: { type: String, trim: true, maxlength: 40 },
        email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      },
      { _id: false },
    ),
    sponsors: {
      type: [
        new Schema(
          { orgId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true }, confirmed: { type: Boolean, default: false } },
          { _id: false },
        ),
      ],
      default: [],
    },
    audienceAge: { type: String, enum: AUDIENCE_AGES },
    safeguardingContact: new Schema(
      { name: { type: String, trim: true, maxlength: 120 }, phone: { type: String, trim: true, maxlength: 40 } },
      { _id: false },
    ),
    authorizationLetterId: { type: Schema.Types.ObjectId, ref: "PrivateFile" },
    review: new Schema(
      {
        submittedAt: Date,
        reviewedAt: Date,
        reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
        reviewedByName: String,
        reason: { type: String, maxlength: 2000 },
      },
      { _id: false },
    ),
    approvedSnapshotHash: { type: String },
    cancelledAt: { type: Date },
    cancelReason: { type: String, maxlength: 2000 },
    // select: false keeps door instructions out of public pages and the API unless asked for.
    doorTags: {
      type: new Schema({ regular: { type: String, trim: true, maxlength: 60 }, vip: { type: String, trim: true, maxlength: 60 } }, { _id: false }),
      select: false,
    },
    startsAt: { type: Date },
    endsAt: { type: Date },
    hideAt: { type: Date },
  },
  // bufferCommands: false makes queries issued before connectDB() fail immediately instead of hanging.
  { timestamps: true, bufferCommands: false },
);

EventSchema.index({ slug: 1 }, { unique: true });
// Every visitor list: published, still visible, closest first.
EventSchema.index({ status: 1, hideAt: 1, startsAt: 1 });
// A host's own events, and the admin review queue.
EventSchema.index({ ownerId: 1, createdAt: -1 });

/** "AWS re:Invent 2026" -> "aws-reinvent-2026" */
function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // drop punctuation
    .trim()
    .replace(/[\s-]+/g, "-") // collapse whitespace/hyphens into single hyphens
    .replace(/^-+|-+$/g, ""); // no leading/trailing hyphen: the API's slug check rejects them
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Normalizes any parseable date to YYYY-MM-DD; throws on invalid input. */
function normalizeDate(value: string): string {
  // Date-only ISO strings are parsed as UTC; verify round-trip to reject values like 2026-02-30.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || !parsed.toISOString().startsWith(value)) {
      throw new Error(`Invalid date: "${value}"`);
    }
    return value;
  }

  // Other formats (e.g. "Nov 9, 2026") are parsed in local time; read local parts to avoid day drift.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: "${value}"`);
  }
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** Normalizes "9:00 AM", "09:00 pm" or "21:00" to 24-hour HH:mm; throws on invalid input. */
function normalizeTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(value.trim());
  if (!match) throw new Error(`Invalid time: "${value}"`);

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();

  if (meridiem) {
    if (hours < 1 || hours > 12) throw new Error(`Invalid time: "${value}"`);
    hours = (hours % 12) + (meridiem === "pm" ? 12 : 0);
  }
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time: "${value}"`);

  return `${pad(hours)}:${pad(minutes)}`;
}

/** Runs a date/time normalizer, reporting failure as a ValidationError on that field. */
function normalized(path: string, value: string, normalize: (value: string) => string): string {
  try {
    return normalize(value);
  } catch (e) {
    throw validationError(path, (e as Error).message, value);
  }
}

// `image` always mirrors the first of `images`, so older code and emails keep working.
EventSchema.pre("validate", function () {
  this.image = this.images[0] ?? "";
});

EventSchema.pre("save", async function () {
  // Normalized first: the slug below takes the year from `date`, which must be YYYY-MM-DD by then.
  if (this.date && this.isModified("date")) this.date = normalized("date", this.date, normalizeDate);
  if (this.time && this.isModified("time")) this.time = normalized("time", this.time, normalizeTime);
  if (this.endDate && this.isModified("endDate")) this.endDate = normalized("endDate", this.endDate, normalizeDate);
  if (this.endTime && this.isModified("endTime")) this.endTime = normalized("endTime", this.endTime, normalizeTime);

  // The slug is fixed once published: changing it would break links already shared and emailed.
  if (this.isNew || !this.slug || (this.status === "draft" && this.isModified("title"))) {
    const EventModel = this.constructor as Model<IEvent>;
    const others = { _id: { $ne: this._id } };
    const duplicate = () => validationError("title", "An event with this title already exists", this.title);

    // Titles in other scripts have nothing to slugify, so they get a random readable slug.
    const base = slugify(this.title) || `event-${randomBytes(4).toString("hex")}`;
    const year = this.date?.slice(0, 4);
    let slug = base;

    // A yearly event can reuse its title; the same title in the same year is a real duplicate.
    const existing = await EventModel.findOne({ slug: base, ...others }).select("date").lean();
    if (existing) {
      if (!year || existing.date?.slice(0, 4) === year) throw duplicate();
      slug = `${base}-${year}`;
      if (await EventModel.exists({ slug, ...others })) throw duplicate();
    }

    this.slug = slug;
  }

  if (this.date && this.time) {
    const times = computeEventTimes({
      date: this.date,
      time: this.time,
      endDate: this.endDate,
      endTime: this.endTime,
      timezone: this.timezone,
    });
    if (times.endsAt && times.endsAt <= times.startsAt) {
      throw validationError("endTime", "The event must end after it starts. For events past midnight, set an end date.", this.endTime);
    }
    this.set(times);
  }
});

// A lost race for a slug surfaces as a raw E11000; report it the same way as the check above.
EventSchema.post("save", { errorHandler: true }, function (error, _res, next) {
  next(
    isDuplicateKeyError(error)
      ? validationError("title", "An event with this title already exists", this.title)
      : error,
  );
});

// Reuse the compiled model across hot reloads to avoid OverwriteModelError.
export const Event: Model<IEvent> =
  (models.Event as Model<IEvent> | undefined) ?? model<IEvent>("Event", EventSchema);

export default Event;
