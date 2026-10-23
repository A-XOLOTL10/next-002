import mongoose, { type ConnectOptions, type Mongoose } from "mongoose";

/**
 * Shape of the cached connection stored on the global object.
 * - `conn`: the resolved Mongoose instance once connected.
 * - `promise`: the in-flight connection attempt, so concurrent callers share it.
 */
interface MongooseCache {
  conn: Mongoose | null;
  promise: Promise<Mongoose> | null;
}

/**
 * Extend the global scope with our cache. In development, Next.js hot-reloads
 * modules on every change, which would otherwise open a new connection each
 * time. `globalThis` survives those reloads, so the connection is reused.
 */
declare global {
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = (globalThis.mongooseCache ??= {
  conn: null,
  promise: null,
});

const connectOptions = {
  // Fail fast instead of queuing model operations while disconnected.
  bufferCommands: false,
  // Give up after 10s (driver default is 30s) so an unreachable cluster
  // returns an error quickly instead of hanging requests.
  serverSelectionTimeoutMS: 10_000,
  // Keep the pool small; serverless instances each open their own pool.
  maxPoolSize: 10,
  // Takes precedence over any database name in the URI. Without it, a URI
  // ending in "/" silently writes to MongoDB's default "test" database.
  dbName: process.env.MONGODB_DB ?? "dev-events",
} satisfies ConnectOptions;

/**
 * Reads MONGODB_URI and rejects common misconfigurations with a clear message
 * rather than a vague driver error. Read lazily so `next build` and imports
 * never throw when the variable is only provided at runtime.
 */
function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error("MONGODB_URI is not defined. Add it to .env.local and restart the server.");
  }
  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    throw new Error('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  }
  if (/<[^>]+>/.test(uri)) {
    throw new Error("MONGODB_URI still contains a placeholder such as <db_password>.");
  }

  return uri;
}

/**
 * Returns a shared Mongoose connection, creating it on first call.
 * Safe to call from any Server Component, Route Handler, or Server Action.
 *
 * Once connected, the driver reconnects automatically after network drops,
 * so the cached instance stays valid and is not recreated here.
 */
export async function connectToDatabase(): Promise<Mongoose> {
  // Reuse an established connection.
  if (cached.conn) return cached.conn;

  // Start a single connection attempt; parallel callers await the same promise.
  cached.promise ??= mongoose.connect(getMongoUri(), connectOptions);

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Clear the failed promise so the next call can retry.
    cached.promise = null;

    const hint =
      error instanceof mongoose.Error.MongooseServerSelectionError
        ? " Check your network and that this IP is allowed in Atlas Network Access."
        : "";
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to MongoDB: ${reason}${hint}`, { cause: error });
  }

  return cached.conn;
}

export default connectToDatabase;
