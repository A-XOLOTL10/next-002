import { NextRequest, NextResponse, connection } from "next/server";
import { getAllEvents } from "@/lib/actions/events.actions";
import { createEvent } from "@/lib/events.service";
import { isAdmin } from "@/lib/auth";
import { isHiddenFromVisitors } from "@/lib/utils";

/** GET /api/events: every published event visitors can see, soonest first (public). */
export async function GET() {
    // "Still visible?" depends on the current time, so this always runs at request time.
    await connection();

    try {
        // Cached read shared with the pages: repeat calls skip MongoDB, and publishing,
        // updating or deleting an event clears it.
        const events = (await getAllEvents()).filter((event) => !isHiddenFromVisitors(event.hideAt));
        return NextResponse.json({ message: "Events fetched successfully", events }, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ message: "Failed to fetch events" }, { status: 500 });
    }
}

/**
 * POST /api/events: create a draft event (admins only). Publish it from the admin
 * preview, or with POST /api/events/[slug]/publish. Body: multipart/form-data with
 * title, description, overview, venue, location, date, time, endTime, mode, audience,
 * organizer, agenda and tags (JSON array string or repeated keys), image files under
 * `images` (or `image`), and optional endDate, timezone and imageDisplay.
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
    return NextResponse.json({ message: "Draft created. Preview and publish it to make it live.", event: result.data }, { status: 201 });
}
