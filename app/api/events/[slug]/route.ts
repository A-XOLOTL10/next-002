import { NextRequest, NextResponse } from "next/server";
import { getEventBySlug } from "@/lib/actions/events.actions";
import { deleteEvent, updateEvent } from "@/lib/events.service";
import { isAdmin } from "@/lib/auth";
import { isValidSlug } from "@/lib/utils";

type Ctx = RouteContext<"/api/events/[slug]">;

/** Reads and validates the slug; returns an error response for missing or malformed slugs. */
async function readSlug(ctx: Ctx): Promise<string | NextResponse> {
    // params is a Promise in this Next.js version; awaiting it also keeps the route request-time.
    const slug = (await ctx.params).slug?.trim().toLowerCase();
    if (!slug) return NextResponse.json({ message: "Event slug is required" }, { status: 400 });
    if (!isValidSlug(slug)) {
        return NextResponse.json(
            { message: "Invalid event slug. Use lowercase letters, numbers and hyphens only." },
            { status: 400 },
        );
    }
    return slug;
}

const unauthorized = () =>
    NextResponse.json({ message: "Unauthorized: sign in via POST /api/auth/login first" }, { status: 401 });

/** GET /api/events/[slug]: one event (public). */
export async function GET(_req: NextRequest, ctx: Ctx) {
    const slug = await readSlug(ctx);
    if (slug instanceof NextResponse) return slug;

    try {
        // The same cached read the event page uses, so both stay in sync.
        const event = await getEventBySlug(slug);
        if (!event) return NextResponse.json({ message: `Event "${slug}" not found` }, { status: 404 });
        return NextResponse.json({ message: "Event fetched successfully", event }, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ message: "Failed to fetch event" }, { status: 500 });
    }
}

/**
 * PUT /api/events/[slug]: update an event (admins only). multipart/form-data with only
 * the fields to change; include an image File to replace the image. Changing the title
 * changes the slug (returned in the response).
 */
export async function PUT(req: NextRequest, ctx: Ctx) {
    if (!(await isAdmin())) return unauthorized();
    const slug = await readSlug(ctx);
    if (slug instanceof NextResponse) return slug;

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ message: "Request body must be multipart/form-data" }, { status: 400 });
    }

    const result = await updateEvent(slug, formData);
    if (!result.ok) {
        return NextResponse.json({ message: result.message, errors: result.errors }, { status: result.status });
    }
    return NextResponse.json({ message: "Event updated successfully", event: result.data }, { status: 200 });
}

/** DELETE /api/events/[slug]: delete an event and all its bookings (admins only). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
    if (!(await isAdmin())) return unauthorized();
    const slug = await readSlug(ctx);
    if (slug instanceof NextResponse) return slug;

    const result = await deleteEvent(slug);
    if (!result.ok) {
        return NextResponse.json({ message: result.message }, { status: result.status });
    }
    return NextResponse.json({ message: "Event deleted successfully", ...result.data }, { status: 200 });
}
