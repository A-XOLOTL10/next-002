import { Schema, model, models, type Model, type Types } from "mongoose";
import { Event } from "./event.model";

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
      index: true, // bookings are almost always looked up per event
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // store one canonical form so lookups are case-insensitive
      validate: {
        validator: (value: string): boolean => EMAIL_REGEX.test(value),
        message: "{VALUE} is not a valid email address",
      },
    },
  },
  { timestamps: true },
);

// Reject bookings for events that don't exist; the `ref` alone doesn't enforce integrity.
BookingSchema.pre("save", async function () {
  if (!this.isModified("eventId")) return;

  const eventExists = await Event.exists({ _id: this.eventId });
  if (!eventExists) {
    throw new Error(`Event with id "${this.eventId.toString()}" does not exist`);
  }
});

// Reuse the compiled model across hot reloads to avoid OverwriteModelError.
export const Booking: Model<IBooking> =
  (models.Booking as Model<IBooking> | undefined) ?? model<IBooking>("Booking", BookingSchema);

export default Booking;
