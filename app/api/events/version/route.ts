import { NextResponse } from "next/server";
import { connection } from "next/server";
import { cacheLife, cacheTag } from "next/cache";
import connectDB from "@/lib/mongodb";
import Event from "@/database/event.model";
import { EVENTS_TAG } from "@/lib/cache-tags";

/**
 * A tiny fingerprint of the public event list: how many live events there are and when the
 * newest change was made. Cached and cleared by the same tag as the lists, so a thousand open
 * tabs asking every 30 seconds cost the database almost nothing; publishing, editing or
 * deleting an event changes it straight away.
 */
async function getEventsVersion(): Promise<string> {
    "use cache";
    cacheLife("minutes");
    cacheTag(EVENTS_TAG);

    await connectDB();
    const [latest, count] = await Promise.all([
        Event.findOne({ status: "published" }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
        Event.countDocuments({ status: "published" }),
    ]);
    return `${count}-${latest?.updatedAt?.getTime() ?? 0}`;
}

/** GET /api/events/version: used by components/LiveRefresh.tsx to know when to refresh a list. */
export async function GET() {
    await connection(); // request time only: never queried during the build
    try {
        return NextResponse.json({ version: await getEventsVersion() }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
        console.error("Events version check failed:", e);
        return NextResponse.json({ version: null }, { status: 503 });
    }
}
