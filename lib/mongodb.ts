import mongoose, { type Mongoose } from "mongoose";

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

/**
 * Returns a shared Mongoose connection, creating it on first call.
 * Safe to call from any Server Component, Route Handler, or Server Action.
 */
export async function connectToDatabase(): Promise<Mongoose> {
  // Reuse an established connection.
  if (cached.conn) return cached.conn;

  // Read the URI lazily so `next build` doesn't fail when the variable is
  // only provided at runtime.
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not defined. Add it to .env.local.");
  }

  // Start a single connection attempt; parallel callers await the same promise.
  cached.promise ??= mongoose.connect(uri, {
    // Fail fast instead of queuing model operations while disconnected.
    bufferCommands: false,
  });

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Clear the failed promise so the next call can retry.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

export default connectToDatabase;
