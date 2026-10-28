import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Event from "@/database/event.model";

// Same shape the Event model's slugify() produces: lowercase words joined by single hyphens.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 200;

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/events/[slug]">) {
    // params is a Promise in this Next.js version; awaiting it also keeps the route request-time.
    const { slug: rawSlug } = await ctx.params;
    const slug = rawSlug?.trim().toLowerCase();

    // Reject malformed slugs before querying, so junk input never reaches the database.
    if (!slug) {
        return NextResponse.json({ message: "Event slug is required" }, { status: 400 });
    }
    if (slug.length > MAX_SLUG_LENGTH || !SLUG_PATTERN.test(slug)) {
        return NextResponse.json(
            { message: "Invalid event slug. Use lowercase letters, numbers and hyphens only." },
            { status: 400 },
        );
    }

    try {
        await connectDB();

        // lean() returns a plain object: faster, and all we need for JSON.
        const event = await Event.findOne({ slug }).lean();

        if (!event) {
            return NextResponse.json({ message: `Event "${slug}" not found` }, { status: 404 });
        }

        return NextResponse.json({ message: "Event fetched successfully", event }, { status: 200 });
    } catch (e) {
        // Connection or query failures; log details server-side.
        console.error(e);
        return NextResponse.json(
            { message: "Failed to fetch event", error: e instanceof Error ? e.message : "Unknown error" },
            { status: 500 },
        );
    }
}
