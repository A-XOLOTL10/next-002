import { Schema, model, models, type Model } from "mongoose";

export interface IRateLimit {
  key: string; // what's being limited, e.g. "login:203.0.113.7"
  count: number;
  expiresAt: Date; // when the window ends
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { bufferCommands: false },
);

// TTL index: MongoDB deletes finished windows by itself, so this collection stays small.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Reuse the compiled model across hot reloads to avoid OverwriteModelError.
export const RateLimit: Model<IRateLimit> =
  (models.RateLimit as Model<IRateLimit> | undefined) ?? model<IRateLimit>("RateLimit", RateLimitSchema);

export default RateLimit;
