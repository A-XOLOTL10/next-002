import { Schema, model, models, type Model, type Types } from "mongoose";

// Sensitive uploads (government IDs, company certificates, signed authorization letters).
// Unlike event images they are never put on a public URL: the bytes are encrypted with
// AES-256-GCM (lib/crypto.ts) and stored here, and only admins can open them, through a
// route that logs every view (app/api/console/files/[id]).

export const FILE_PURPOSES = ["id_document", "company_document", "authorization_letter", "appeal"] as const;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export interface IPrivateFile {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  purpose: FilePurpose;
  filename: string;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  size: number;
  sha256: string; // of the original bytes: spots the same document uploaded to two accounts
  iv: Buffer;
  authTag: Buffer;
  data: Buffer; // encrypted
  /** Set when the owner's account is closed: MongoDB deletes the file at this time. */
  deleteAt?: Date;
  createdAt: Date;
}

const PrivateFileSchema = new Schema<IPrivateFile>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: FILE_PURPOSES, required: true },
    filename: { type: String, required: true, maxlength: 200 },
    contentType: { type: String, enum: ["application/pdf", "image/png", "image/jpeg"], required: true },
    size: { type: Number, required: true },
    sha256: { type: String, required: true },
    iv: { type: Buffer, required: true },
    authTag: { type: Buffer, required: true },
    data: { type: Buffer, required: true, select: false },
    deleteAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false }, bufferCommands: false },
);

PrivateFileSchema.index({ ownerId: 1 });
PrivateFileSchema.index({ sha256: 1 });
PrivateFileSchema.index({ deleteAt: 1 }, { expireAfterSeconds: 0 });

export const PrivateFile: Model<IPrivateFile> =
  (models.PrivateFile as Model<IPrivateFile> | undefined) ?? model<IPrivateFile>("PrivateFile", PrivateFileSchema);

export default PrivateFile;
