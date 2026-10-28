import { Schema, model, models, type Model, type Types } from "mongoose";
import { Event, isDuplicateKeyError, validationError } from "./event.model";

export interface IBooking {
  eventId: Types.ObjectId;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

// Pragmatic format check (local@domain.tld); deliverability is confirmed by sending mail, not by regex.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  },
  // bufferCommands: false makes queries issued before connectToDatabase() fail immediately instead of hanging.
  { timestamps: true, bufferCommands: false },
);

// One booking per email per event, enforced by the database so concurrent requests can't slip through.
// eventId leads the index, so it also serves "all bookings for an event" queries without a separate index.
BookingSchema.index({ eventId: 1, email: 1 }, { unique: true });

// Reject bookings for events that don't exist; the `ref` alone doesn't enforce integrity.
BookingSchema.pre("save", async function () {
  if (!this.isModified("eventId")) return;

  const eventExists = await Event.exists({ _id: this.eventId });
  if (!eventExists) {
    throw validationError("eventId", "Event does not exist", this.eventId);
  }
});

// Turn the unique-index violation into a readable validation error.
BookingSchema.post("save", { errorHandler: true }, function (error, _res, next) {
  next(
    isDuplicateKeyError(error)
      ? validationError("email", "This email has already booked this event", this.email)
      : error,
  );
});

// Reuse the compiled model across hot reloads to avoid OverwriteModelError.
export const Booking: Model<IBooking> =
  (models.Booking as Model<IBooking> | undefined) ?? model<IBooking>("Booking", BookingSchema);

export default Booking;
