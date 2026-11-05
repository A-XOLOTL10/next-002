import { Schema, model, models, type Model, type Types } from "mongoose";
import { REPORT_REASONS, type ReportReason } from "./report.constants";

// A host's proposed change to an event that's already live. Visitors keep seeing the approved
// version until an admin approves the revision; then the changes are copied onto the event.
// Only one revision per event can be waiting at a time (a newer one replaces it).

export const REVISION_STATUSES = ["pending", "approved", "rejected", "superseded"] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export interface IEventRevision {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  proposedBy: Types.ObjectId;
  /** Only the fields that change, with their new values. */
  changes: Record<string, unknown>;
  /** The full image list after the change (new uploads are already on Cloudinary). */
  images?: string[];
  status: RevisionStatus;
  reviewedBy?: Types.ObjectId;
  reviewedByName?: string;
  reviewedAt?: Date;
  reason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EventRevisionSchema = new Schema<IEventRevision>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    proposedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    changes: { type: Schema.Types.Mixed, required: true },
    images: { type: [String], default: undefined },
    status: { type: String, enum: REVISION_STATUSES, required: true, default: "pending" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedByName: { type: String },
    reviewedAt: { type: Date },
    reason: { type: String, maxlength: 2000 },
  },
  { timestamps: true, bufferCommands: false, minimize: false },
);

EventRevisionSchema.index({ eventId: 1 }, { unique: true, partialFilterExpression: { status: "pending" } });
EventRevisionSchema.index({ status: 1, createdAt: 1 });

export const EventRevision: Model<IEventRevision> =
  (models.EventRevision as Model<IEventRevision> | undefined) ?? model<IEventRevision>("EventRevision", EventRevisionSchema);

// ---------------------------------------------------------------- reports

/** "Report this event" from visitors. Goes to the admin approvals queue. */
export { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "./report.constants";

export interface IReport {
  _id: Types.ObjectId;
  eventId: Types.ObjectId;
  reason: ReportReason;
  details?: string;
  contactEmail?: string;
  status: "open" | "resolved";
  resolvedBy?: Types.ObjectId;
  resolvedByName?: string;
  resolution?: string;
  createdAt: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    details: { type: String, trim: true, maxlength: 2000 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    status: { type: String, enum: ["open", "resolved"], required: true, default: "open" },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedByName: { type: String },
    resolution: { type: String, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

ReportSchema.index({ status: 1, createdAt: 1 });

export const Report: Model<IReport> = (models.Report as Model<IReport> | undefined) ?? model<IReport>("Report", ReportSchema);

export default EventRevision;
