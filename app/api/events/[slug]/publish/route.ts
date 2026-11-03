import { NextRequest, NextResponse } from "next/server";
import { isAdmin, verifyPublishPin } from "@/lib/auth";
import { publishEvents } from "@/lib/events.service";
import { isValidSlug } from "@/lib/utils";

/** POST /api/events/[slug]/publish: make a draft live (admins only). Body: JSON { "pin": "1234" }. */
export async function POST(req: NextRequest, ctx: RouteContext<"/api/events/[slug]/publish">) {
    if (!(await isAdmin())) {
        return NextResponse.json({ message: "Unauthorized: sign in via POST /api/auth/login first" }, { status: 401 });
    }

    const slug = (await ctx.params).slug.trim().toLowerCase();
    if (!isValidSlug(slug)) return NextResponse.json({ message: "Invalid event slug" }, { status: 400 });

    let pin: unknown;
    try {
        ({ pin } = (await req.json()) as { pin?: unknown });
    } catch {
        return NextResponse.json({ message: 'Send JSON: { "pin": "..." }' }, { status: 400 });
    }
    if (typeof pin !== "string" || !pin.trim()) return NextResponse.json({ message: "pin is required" }, { status: 400 });

    const check = await verifyPublishPin(pin);
    if (check === "wrong") return NextResponse.json({ message: "Incorrect PIN" }, { status: 403 });
    if (check === "locked") return NextResponse.json({ message: "Too many wrong PINs. Try again in 15 minutes." }, { status: 429 });
    if (check === "unconfigured") return NextResponse.json({ message: "Publishing isn't configured on the server" }, { status: 503 });

    const result = await publishEvents([slug]);
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: result.status });

    const [failure] = result.data.failed;
    if (failure) {
        const status = failure.message === "Event not found" ? 404 : 400;
        return NextResponse.json({ message: failure.message, errors: failure.errors }, { status });
    }
    return NextResponse.json({ message: "Event published", slug }, { status: 200 });
}
