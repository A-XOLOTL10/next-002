import mongoose, { Schema, model, models, mongo, type Model } from "mongoose";

export const EVENT_MODES = ["online", "offline", "hybrid"] as const;
export type EventMode = (typeof EVENT_MODES)[number];

export interface IEvent {
  title: string;
  slug: string;
  description: string;
  overview: string;
  image: string;
  venue: string;
  location: string;
  date: string; // ISO date, YYYY-MM-DD
  time: string; // 24-hour, HH:mm
  mode: EventMode;
  audience: string;
  agenda: string[];
  organizer: string;
  tags: string[];
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

// `required` + `trim` rejects missing values and whitespace-only strings.
const requiredString = { type: String, required: true, trim: true } as const;

// Mongoose defaults arrays to [], so `required` alone never fails; enforce at least one non-empty item.
const nonEmptyStringArray = {
  type: [String],
  required: true,
  validate: {
    validator: (items: string[]): boolean =>
      items.length > 0 && items.every((item) => item.trim().length > 0),
    message: "{PATH} must contain at least one non-empty item",
  },
};

const EventSchema = new Schema<IEvent>(
  {
    title: requiredString,
    slug: { type: String, lowercase: true, trim: true },
    description: requiredString,
    overview: requiredString,
    image: requiredString,
    venue: requiredString,
    location: requiredString,
    date: requiredString,
    time: requiredString,
    mode: { ...requiredString, lowercase: true, enum: EVENT_MODES },
    audience: requiredString,
    agenda: nonEmptyStringArray,
    organizer: requiredString,
    tags: nonEmptyStringArray,
  },
  // bufferCommands: false makes queries issued before connectToDatabase() fail immediately instead of hanging.
  { timestamps: true, bufferCommands: false },
);

EventSchema.index({ slug: 1 }, { unique: true });

/** "AWS re:Invent 2026" -> "aws-reinvent-2026" */
function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // drop punctuation
    .trim()
    .replace(/[\s-]+/g, "-"); // collapse whitespace/hyphens into single hyphens
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

EventSchema.pre("save", function () {
  // Only regenerate the slug when the title changes, so existing URLs stay stable.
  if (this.isModified("title") || !this.slug) {
    const slug = slugify(this.title);
    if (!slug) throw new Error("Title must contain at least one letter or number");
    this.slug = slug;
  }

  if (this.isModified("date")) this.date = normalizeDate(this.date);
  if (this.isModified("time")) this.time = normalizeTime(this.time);
});

// Two events with the same title produce the same slug; report that clearly instead of a raw E11000.
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
