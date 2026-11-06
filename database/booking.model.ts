import { randomInt } from "node:crypto";
import { Schema, model, models, mongo, type Model, type Types } from "mongoose";
import { Event, isDuplicateKeyError, validationError } from "./event.model";
import { BOOKING_SOURCES, TICKET_TIERS, type BookingSource, type TicketTier } from "./ticket.constants";

// Events are free, so a booking is "pending" until the visitor clicks the link emailed to
// them. That proves they own the address (nobody can book with someone else's email) and
// keeps fake addresses out of the counts. Only confirmed bookings count and get a ticket.
export const BOOKING_STATUSES = ["pending", "confirmed"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface IBooking {
  eventId: Types.ObjectId;
  email: string;
  ticketId: string;
  status: BookingStatus;
  /** SHA-256 of the emailed confirmation token; the token itself is never stored. Pending only. */
  verificationTokenHash?: string;
  /** When the confirmation link stops working (and the pending booking is auto-deleted). Pending only. */
  verificationExpiresAt?: Date;
  confirmedAt?: Date;
  /** When the ticket's QR code was scanned at the door. A ticket can only be used once. */
  checkedInAt?: Date;
  /** Who admitted it: a signed-in account on the website, or a phone running the scanner app. */
  checkedInBy?: { kind: "web" | "admin_device" | "staff_device"; name: string; deviceId?: Types.ObjectId };
  /** "vip" when the email is on the event's VIP list. Older bookings have no value: regular. */
  tier?: TicketTier;
  source?: BookingSource;
  createdAt: Date;
  updatedAt: Date;
}

// Pragmatic format check (local@domain.tld); deliverability is confirmed by sending mail, not by regex.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// No 0/O or 1/I/L, so a ticket ID read aloud or copied by hand can't be mistyped.
const TICKET_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** e.g. "DEV-7KQ2M9XA4P": 10 random characters (~49 bits), from a cryptographically secure source. */
function generateTicketId(): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += TICKET_ALPHABET[randomInt(TICKET_ALPHABET.length)];
  return `DEV-${id}`;
}

const BookingSchema = new Schema<IBooking>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // one canonical form, so "A@x.com" and "a@x.com" count as the same booker
      validate: {
        validator: (value: string): boolean => EMAIL_REGEX.test(value),
        message: "{VALUE} is not a valid email address",
      },
    },
    // Generated on create. The unique index covers all events, and the QR code encodes this
    // ID, so no two tickets anywhere can ever share a QR code.
    ticketId: { type: String, required: true, unique: true, default: generateTicketId },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: "pending" },
    // select: false keeps the hash out of every query result unless explicitly asked for.
    // Sparse + unique: confirmed bookings have no hash, and each pending one has its own.
    verificationTokenHash: { type: String, select: false, index: { unique: true, sparse: true } },
    verificationExpiresAt: { type: Date },
    confirmedAt: { type: Date },
    checkedInAt: { type: Date },
    checkedInBy: new Schema(
      { kind: { type: String, enum: ["web", "admin_device", "staff_device"] }, name: String, deviceId: Schema.Types.ObjectId },
      { _id: false },
    ),
    tier: { type: String, enum: TICKET_TIERS, default: "regular" },
    source: { type: String, enum: BOOKING_SOURCES, default: "booking" },
  },
  // bufferCommands: false makes queries issued before connectToDatabase() fail immediately instead of hanging.
  { timestamps: true, bufferCommands: false },
);

// One booking per email per event, enforced by the database so concurrent requests can't slip through.
// eventId leads the index, so it also serves "all bookings for an event" queries without a separate index.
BookingSchema.index({ eventId: 1, email: 1 }, { unique: true });

// TTL index: MongoDB deletes a pending booking once its link expires, freeing the email to book
// again. Confirmed bookings have no expiry (and the partial filter excludes them anyway).
BookingSchema.index(
  { verificationExpiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: "pending" } },
);

// Reject bookings for events that don't exist; the `ref` alone doesn't enforce integrity.
BookingSchema.pre("save", async function () {
  if (!this.isModified("eventId")) return;

  const eventExists = await Event.exists({ _id: this.eventId });
  if (!eventExists) {
    throw validationError("eventId", "Event does not exist", this.eventId);
  }
});

// Turn the { eventId, email } violation into a readable validation error. Checks which
// index failed, so a (vanishingly rare) ticketId collision isn't reported as "already booked".
BookingSchema.post("save", { errorHandler: true }, function (error, _res, next) {
  const isDuplicateBooking =
    isDuplicateKeyError(error) && (error as mongo.MongoServerError).keyPattern?.email !== undefined;

  next(
    isDuplicateBooking
      ? validationError("email", "This email has already booked this event", this.email)
      : error,
  );
});

// Reuse the compiled model across hot reloads to avoid OverwriteModelError.
export const Booking: Model<IBooking> =
  (models.Booking as Model<IBooking> | undefined) ?? model<IBooking>("Booking", BookingSchema);

export default Booking;
