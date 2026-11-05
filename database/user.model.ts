import { Schema, model, models, type Model, type Types } from "mongoose";
import { OAUTH_PROVIDERS, ROLES, USER_STATUSES, type OAuthProvider, type Role, type UserStatus } from "./user.constants";

// Everyone who signs in: hosts, supra admins and the super admin. Visitors who only book
// events never get an account (their email lives on the booking).

export interface IUser {
  _id: Types.ObjectId;
  email: string; // lowercase, unique
  name: string;
  role: Role;
  status: UserStatus;
  /** scrypt hash (see lib/passwords.ts). Absent for accounts that only sign in with Google/GitHub. */
  passwordHash?: string;
  /** Set when the address is proven: by an emailed link, or by Google/GitHub saying it's verified. */
  emailVerifiedAt?: Date;
  /** The super admin created from env vars with a short password must pick a new one. */
  mustChangePassword?: boolean;
  providers: { provider: OAuthProvider; providerId: string; linkedAt: Date }[];
  avatarUrl?: string;
  /** Google Workspace domain, when signed in with a company Google account. */
  googleWorkspaceDomain?: string;
  /** When the host finished (or skipped) the welcome slides. */
  onboardedAt?: Date;
  lastLoginAt?: Date;
  /** SHA-256 of device cookies and the countries this account has signed in from (new ones trigger extra checks). */
  knownDevices: string[];
  knownCountries: string[];
  /** Authenticator app (TOTP), required for admins. The secret is encrypted (lib/crypto.ts). */
  totpSecretEncrypted?: string;
  totpEnabledAt?: Date;
  /** The last 30-second step a code was accepted for, so the same code can't be used twice. */
  totpLastUsedStep?: number;
  /** Hashes of unused one-time backup codes. */
  backupCodeHashes: string[];
  invitedBy?: Types.ObjectId;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, enum: ROLES, required: true, default: "host" },
    status: { type: String, enum: USER_STATUSES, required: true, default: "active" },
    passwordHash: { type: String, select: false },
    emailVerifiedAt: { type: Date },
    mustChangePassword: { type: Boolean },
    providers: {
      type: [
        {
          _id: false,
          provider: { type: String, enum: OAUTH_PROVIDERS, required: true },
          providerId: { type: String, required: true },
          linkedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
    avatarUrl: { type: String },
    googleWorkspaceDomain: { type: String, lowercase: true },
    onboardedAt: { type: Date },
    lastLoginAt: { type: Date },
    knownDevices: { type: [String], default: [], select: false },
    knownCountries: { type: [String], default: [] },
    totpSecretEncrypted: { type: String, select: false },
    totpEnabledAt: { type: Date },
    totpLastUsedStep: { type: Number, select: false },
    backupCodeHashes: { type: [String], default: [], select: false },
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
    deletedAt: { type: Date },
  },
  { timestamps: true, bufferCommands: false },
);

UserSchema.index({ email: 1 }, { unique: true });
// Exactly one super admin can exist: the database refuses a second one, even from two requests at once.
UserSchema.index({ role: 1 }, { unique: true, partialFilterExpression: { role: "super_admin" } });
// One DevEvent account per Google/GitHub account.
UserSchema.index(
  { "providers.provider": 1, "providers.providerId": 1 },
  { unique: true, partialFilterExpression: { "providers.providerId": { $exists: true } } },
);

export const User: Model<IUser> = (models.User as Model<IUser> | undefined) ?? model<IUser>("User", UserSchema);

export default User;
