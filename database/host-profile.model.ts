import { Schema, model, models, type Model, type Types } from "mongoose";
import {
  ACCOUNT_TYPES,
  HOST_STATUSES,
  ID_TYPES,
  ORG_CHECK_STATUSES,
  ORG_ROLES,
  type AccountType,
  type HostStatus,
  type IdType,
  type OrgCheckStatus,
  type OrgRole,
} from "./user.constants";

// A host's verification (KYC) file: who they are, the organizations behind their events, and
// every check an admin made. Hosts can only create events once this is "approved".
//
// Organizations are the heart of it: DevEvent is for corporate and developer events, so every
// host names at least one company or sponsor. An admin contacts each one; if any of them denies
// the partnership, the host is "denied" and may explain once (an appeal).

export interface IOrganization {
  _id: Types.ObjectId;
  name: string;
  role: OrgRole;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  website?: string;
  status: OrgCheckStatus;
  attempts: number; // calls/emails that got no answer
  notes?: string;
  checkedBy?: Types.ObjectId;
  checkedByName?: string;
  checkedAt?: Date;
}

export interface IContactLogEntry {
  at: Date;
  by: Types.ObjectId;
  byName: string;
  orgId?: Types.ObjectId;
  orgName?: string;
  outcome: string; // "confirmed", "denied", "no answer", "note"...
  notes?: string;
}

export interface IHostProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  accountType: AccountType;
  companyName?: string; // required for companies; individuals may name their own brand
  companyRegNumber?: string; // e.g. CAC RC/BN number
  companyAddress?: string;
  companyDescription?: string;
  website?: string;
  socials: string[];
  contactName: string;
  contactRole?: string;
  contactPhone: string;
  contactEmail: string;
  organizations: IOrganization[];
  idDocument?: { type: IdType; number: string; expiresAt?: string; fileId: Types.ObjectId };
  companyDocumentIds: Types.ObjectId[];
  status: HostStatus;
  consentAt?: Date;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: Types.ObjectId;
  reviewedByName?: string;
  decisionReason?: string;
  denialCount: number;
  appeal?: { message: string; fileIds: Types.ObjectId[]; submittedAt: Date };
  contactLog: IContactLogEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  role: { type: String, enum: ORG_ROLES, required: true },
  contactName: { type: String, required: true, trim: true, maxlength: 120 },
  contactPhone: { type: String, required: true, trim: true, maxlength: 40 },
  contactEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  website: { type: String, trim: true, maxlength: 300 },
  status: { type: String, enum: ORG_CHECK_STATUSES, required: true, default: "pending" },
  attempts: { type: Number, default: 0 },
  notes: { type: String, maxlength: 2000 },
  checkedBy: { type: Schema.Types.ObjectId, ref: "User" },
  checkedByName: { type: String },
  checkedAt: { type: Date },
});

const ContactLogSchema = new Schema<IContactLogEntry>(
  {
    at: { type: Date, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    byName: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId },
    orgName: { type: String },
    outcome: { type: String, required: true },
    notes: { type: String, maxlength: 2000 },
  },
  { _id: false },
);

const HostProfileSchema = new Schema<IHostProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    accountType: { type: String, enum: ACCOUNT_TYPES, required: true },
    companyName: { type: String, trim: true, maxlength: 160 },
    companyRegNumber: { type: String, trim: true, maxlength: 60 },
    companyAddress: { type: String, trim: true, maxlength: 300 },
    companyDescription: { type: String, trim: true, maxlength: 2000 },
    website: { type: String, trim: true, maxlength: 300 },
    socials: { type: [String], default: [] },
    contactName: { type: String, trim: true, maxlength: 120 }, // required on submit (lib/host.service.ts), not for drafts
    contactRole: { type: String, trim: true, maxlength: 120 },
    contactPhone: { type: String, trim: true, maxlength: 40 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 254 },
    organizations: { type: [OrganizationSchema], default: [] },
    idDocument: new Schema(
      {
        type: { type: String, enum: ID_TYPES, required: true },
        number: { type: String, required: true, trim: true, maxlength: 60 },
        expiresAt: { type: String },
        fileId: { type: Schema.Types.ObjectId, ref: "PrivateFile", required: true },
      },
      { _id: false },
    ),
    companyDocumentIds: { type: [Schema.Types.ObjectId], default: [] },
    status: { type: String, enum: HOST_STATUSES, required: true, default: "draft" },
    consentAt: { type: Date },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedByName: { type: String },
    decisionReason: { type: String, maxlength: 2000 },
    denialCount: { type: Number, default: 0 },
    appeal: new Schema(
      {
        message: { type: String, required: true, maxlength: 4000 },
        fileIds: { type: [Schema.Types.ObjectId], default: [] },
        submittedAt: { type: Date, required: true },
      },
      { _id: false },
    ),
    contactLog: { type: [ContactLogSchema], default: [] },
  },
  { timestamps: true, bufferCommands: false },
);

HostProfileSchema.index({ userId: 1 }, { unique: true });
HostProfileSchema.index({ status: 1, submittedAt: 1 });
// Spot the same company registration number on two accounts (flagged to the admin, not blocked).
HostProfileSchema.index({ companyRegNumber: 1 }, { partialFilterExpression: { companyRegNumber: { $type: "string" } } });

export const HostProfile: Model<IHostProfile> =
  (models.HostProfile as Model<IHostProfile> | undefined) ?? model<IHostProfile>("HostProfile", HostProfileSchema);

export default HostProfile;
