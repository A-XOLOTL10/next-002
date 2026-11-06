import { Schema, model, models, type Model, type Types } from "mongoose";

// An event's VIP list: emails the host (or an admin) marked as VIP. Each one gets a ticket
// straight away (see lib/vip.service.ts), and the door scanner shows those tickets as VIP.
// Kept out of the Event document so the list can never leak into a public page or the API.

export interface IVipGuest {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  email: string;
  addedBy: Types.ObjectId;
  addedByName: string;
  createdAt: Date;
}

const VipGuestSchema = new Schema<IVipGuest>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    addedByName: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

// Once per event; eventId leads, so it also serves "the whole list for an event".
VipGuestSchema.index({ eventId: 1, email: 1 }, { unique: true });

export const VipGuest: Model<IVipGuest> =
  (models.VipGuest as Model<IVipGuest> | undefined) ?? model<IVipGuest>("VipGuest", VipGuestSchema);

export default VipGuest;
