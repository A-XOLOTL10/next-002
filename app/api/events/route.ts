import { NextRequest, NextResponse } from "next/server";
import { getAllEvents } from "@/lib/actions/events.actions";
import { createEvent } from "@/lib/events.service";
import { isAdmin } from "@/lib/auth";

/** GET /api/events: all events, newest first (public). */
export async function GET() {
    try {
        // Cached read shared with the pages: repeat calls skip MongoDB, and creating,
        // updating or deleting an event clears it.
        const events = await getAllEvents();
        return NextResponse.json({ message: "Events fetched successfully", events }, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ message: "Failed to fetch events" }, { status: 500 });
    }
}

/**
 * POST /api/events: create an event (admins only). Body: multipart/form-data with
 * title, description, overview, venue, location, date, time, mode, audience, organizer,
 * agenda, tags (JSON array string or repeated keys) and image (File).
 */
export async function POST(req: NextRequest) {
    if (!(await isAdmin())) {
        return NextResponse.json({ message: "Unauthorized: sign in via POST /api/auth/login first" }, { status: 401 });
    }

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ message: "Request body must be multipart/form-data" }, { status: 400 });
    }

    const result = await createEvent(formData);
    if (!result.ok) {
        return NextResponse.json({ message: result.message, errors: result.errors }, { status: result.status });
    }
    return NextResponse.json({ message: "Event created successfully", event: result.data }, { status: 201 });
}
