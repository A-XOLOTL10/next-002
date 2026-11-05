import { Schema, model, models, type Model, type Types } from "mongoose";

// The activity log: who did what, when, and from where. Written by the server for every
// sign-in and every admin or host action; the browser adds page views and clicks (marked
// source "client", because a browser can block or fake them). Entries are never edited,
// and MongoDB deletes them after 12 months.

export const LOG_CATEGORIES = ["auth", "events", "bookings", "hosts", "team", "navigation", "security"] as const;
export type LogCategory = (typeof LOG_CATEGORIES)[number];

export const LOG_CATEGORY_LABELS: Record<LogCategory, string> = {
  auth: "Sign-in",
  events: "Events",
  bookings: "Bookings & check-in",
  hosts: "Host verification",
  team: "Admin team",
  navigation: "Pages & clicks",
  security: "Security",
};

export const LOG_SEVERITIES = ["info", "warning", "critical"] as const;
export type LogSeverity = (typeof LOG_SEVERITIES)[number];

export const LOG_RETENTION_DAYS = 365;

export interface IAuditLog {
  _id: Types.ObjectId;
  at: Date;
  actorId?: Types.ObjectId;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  category: LogCategory;
  action: string; // e.g. "event.publish", "host.approve", "auth.login_failed"
  severity: LogSeverity;
  summary: string; // one readable sentence
  target?: { type: string; id?: string; label?: string };
  details?: Record<string, unknown>;
  /** For approvals: SHA-256 of exactly what was approved, so later edits can't be confused with it. */
  snapshotHash?: string;
  ip?: string;
  country?: string;
  userAgent?: string;
  sessionId?: string;
  source: "server" | "client";
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    at: { type: Date, required: true, default: () => new Date() },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorEmail: { type: String },
    actorName: { type: String },
    actorRole: { type: String },
    category: { type: String, enum: LOG_CATEGORIES, required: true },
    action: { type: String, required: true },
    severity: { type: String, enum: LOG_SEVERITIES, required: true, default: "info" },
    summary: { type: String, required: true, maxlength: 500 },
    // A sub-schema because one of its fields is called "type", which Mongoose otherwise reads as the field's type.
    target: new Schema({ type: { type: String }, id: String, label: String }, { _id: false }),
    details: { type: Schema.Types.Mixed },
    snapshotHash: { type: String },
    ip: { type: String },
    country: { type: String },
    userAgent: { type: String, maxlength: 400 },
    sessionId: { type: String },
    source: { type: String, enum: ["server", "client"], required: true, default: "server" },
  },
  { bufferCommands: false, versionKey: false },
);

// Newest first is how every view reads it; the others serve the filter buttons.
AuditLogSchema.index({ at: -1 });
AuditLogSchema.index({ category: 1, at: -1 });
AuditLogSchema.index({ actorId: 1, at: -1 });
AuditLogSchema.index({ severity: 1, at: -1 });
AuditLogSchema.index({ at: 1 }, { expireAfterSeconds: LOG_RETENTION_DAYS * 24 * 60 * 60 });

export const AuditLog: Model<IAuditLog> =
  (models.AuditLog as Model<IAuditLog> | undefined) ?? model<IAuditLog>("AuditLog", AuditLogSchema);

/** Active minutes per admin per day (from the browser's heartbeat while the tab is open). */
export interface IActivityDay {
  userId: Types.ObjectId;
  day: string; // YYYY-MM-DD (UTC)
  activeSeconds: number;
  expiresAt: Date;
}

const ActivityDaySchema = new Schema<IActivityDay>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    day: { type: String, required: true },
    activeSeconds: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { bufferCommands: false, versionKey: false },
);

ActivityDaySchema.index({ userId: 1, day: 1 }, { unique: true });
ActivityDaySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ActivityDay: Model<IActivityDay> =
  (models.ActivityDay as Model<IActivityDay> | undefined) ?? model<IActivityDay>("ActivityDay", ActivityDaySchema);

export default AuditLog;
