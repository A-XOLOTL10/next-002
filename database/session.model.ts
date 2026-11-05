import { Schema, model, models, type Model, type Types } from "mongoose";
import { ROLES, type Role } from "./user.constants";

// A signed-in browser. The cookie holds a random token; only its SHA-256 is stored here, so a
// leaked database can't be used to sign in. Deleting a row signs that browser out immediately
// (used when an admin is removed, a password changes, or someone clicks "sign out everywhere").

export interface ISession {
  _id: Types.ObjectId;
  tokenHash: string;
  userId: Types.ObjectId;
  role: Role; // copied at sign-in; a role change deletes the user's sessions
  ip: string;
  country?: string;
  city?: string;
  userAgent?: string;
  deviceHash?: string;
  createdAt: Date;
  lastSeenAt: Date;
  /** Absolute end (admins 8 hours, hosts 14 days). MongoDB deletes the row after it. */
  expiresAt: Date;
}

const SessionSchema = new Schema<ISession>(
  {
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ROLES, required: true },
    ip: { type: String, required: true },
    country: { type: String },
    city: { type: String },
    userAgent: { type: String, maxlength: 400 },
    deviceHash: { type: String },
    lastSeenAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

SessionSchema.index({ tokenHash: 1 }, { unique: true });
SessionSchema.index({ userId: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session: Model<ISession> =
  (models.Session as Model<ISession> | undefined) ?? model<ISession>("Session", SessionSchema);

export default Session;
