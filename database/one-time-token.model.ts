import { Schema, model, models, type Model, type Types } from "mongoose";

// Every short-lived secret sent to someone: email confirmation links, password reset links,
// admin invites, the 6-digit codes for unusual sign-ins, and the QR codes that set up the
// scanner app (an admin linking their phone, or a staff pass). Only a hash is stored, each one
// works once, and MongoDB deletes it when it expires.

export const TOKEN_PURPOSES = ["email_verify", "password_reset", "admin_invite", "login_challenge", "device_link", "staff_pass"] as const;
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];

export interface IOneTimeToken {
  _id: Types.ObjectId;
  purpose: TokenPurpose;
  tokenHash: string;
  userId: Types.ObjectId;
  /** For sign-in challenges: the 6-digit code's hash, and wrong guesses so far. */
  codeHash?: string;
  attempts: number;
  /** What a sign-in challenge is protecting (device, place, why it was flagged). */
  meta?: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
}

const OneTimeTokenSchema = new Schema<IOneTimeToken>(
  {
    purpose: { type: String, enum: TOKEN_PURPOSES, required: true },
    tokenHash: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    codeHash: { type: String },
    attempts: { type: Number, default: 0 },
    meta: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

OneTimeTokenSchema.index({ tokenHash: 1 }, { unique: true });
OneTimeTokenSchema.index({ userId: 1, purpose: 1 });
OneTimeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OneTimeToken: Model<IOneTimeToken> =
  (models.OneTimeToken as Model<IOneTimeToken> | undefined) ?? model<IOneTimeToken>("OneTimeToken", OneTimeTokenSchema);

export default OneTimeToken;
