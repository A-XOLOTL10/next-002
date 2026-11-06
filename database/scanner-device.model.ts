import { Schema, model, models, type Model, type Types } from "mongoose";

// A phone running the DevEvent Scanner app (the mobile/ folder). Two kinds, never the same phone:
//
// - "admin": linked to a super or supra admin's account by scanning a code from the website's
//   Mobile app page (after a fresh authenticator code). Can check in any event and hand out
//   staff passes. Stops working the moment the admin is suspended, removed or loses the role.
// - "staff": made by scanning a staff pass an admin issued. Belongs to no account at all, so
//   there is no password, email or setting to change on it: it can look tickets up and admit
//   them for ONE event until it expires. It stops working if the admin who issued it is removed.
//
// The phone holds a random token; only its SHA-256 is stored here (like web sessions).

export const DEVICE_KINDS = ["admin", "staff"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export interface IScannerDevice {
  _id: Types.ObjectId;
  kind: DeviceKind;
  tokenHash: string;
  /** SHA-256 of the app's install ID: one install holds one credential, and an admin's phone can't take a staff pass. */
  installHash: string;
  /** The phone's own name ("Pixel 8"), as the app reported it. */
  deviceName: string;
  platform?: string;
  /** Admin devices: whose account. */
  userId?: Types.ObjectId;
  /** Staff devices: who uses it ("Gate A, Tunde"), the one event it may scan, and who issued it. */
  label?: string;
  eventId?: Types.ObjectId;
  issuedBy?: Types.ObjectId;
  issuedByName?: string;
  lastSeenAt: Date;
  lastIp?: string;
  /** MongoDB deletes the row after this, which also signs the phone out. */
  expiresAt: Date;
  createdAt: Date;
}

const ScannerDeviceSchema = new Schema<IScannerDevice>(
  {
    kind: { type: String, enum: DEVICE_KINDS, required: true },
    tokenHash: { type: String, required: true },
    installHash: { type: String, required: true },
    deviceName: { type: String, required: true, maxlength: 80 },
    platform: { type: String, maxlength: 20 },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    label: { type: String, maxlength: 60 },
    eventId: { type: Schema.Types.ObjectId, ref: "Event" },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User" },
    issuedByName: { type: String },
    lastSeenAt: { type: Date, required: true },
    lastIp: { type: String },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

ScannerDeviceSchema.index({ tokenHash: 1 }, { unique: true });
ScannerDeviceSchema.index({ installHash: 1 });
ScannerDeviceSchema.index({ userId: 1 });
ScannerDeviceSchema.index({ eventId: 1 });
ScannerDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ScannerDevice: Model<IScannerDevice> =
  (models.ScannerDevice as Model<IScannerDevice> | undefined) ?? model<IScannerDevice>("ScannerDevice", ScannerDeviceSchema);

export default ScannerDevice;
