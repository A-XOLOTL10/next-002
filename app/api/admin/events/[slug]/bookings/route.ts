import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getEventBookings } from "@/lib/admin-data";
import { isValidSlug } from "@/lib/utils";

/**
 * Quotes a CSV field. Also neutralises spreadsheet formula injection: a value starting
 * with = + - @ (e.g. an email typed as "=HYPERLINK(...)") would otherwise run as a
 * formula when the file is opened in Excel or Sheets.
 */
function csvField(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
}

/** GET /api/admin/events/[slug]/bookings: download an event's bookings as CSV (admins only). */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/events/[slug]/bookings">) {
    if (!(await isAdmin())) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const slug = (await ctx.params).slug.trim().toLowerCase();
    if (!isValidSlug(slug)) {
        return NextResponse.json({ message: "Invalid event slug" }, { status: 400 });
    }

    try {
        const data = await getEventBookings(slug);
        if (!data) {
            return NextResponse.json({ message: `Event "${slug}" not found` }, { status: 404 });
        }

        // A ticket only becomes valid once the visitor confirms their email.
        const rows = [
            ["Email", "Status", "Ticket ID", "Booked At (UTC)", "Checked In At (UTC)"],
            ...data.bookings.map((b) => [b.email, b.status, b.status === "confirmed" ? b.ticketId : "", b.bookedAt, b.checkedInAt ?? ""]),
        ];
        const csv = rows.map((row) => row.map(csvField).join(",")).join("\r\n");

        return new Response(csv, {
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${slug}-bookings.csv"`,
                "Cache-Control": "no-store", // personal data: never cache
            },
        });
    } catch (e) {
        console.error("Bookings export failed:", e);
        return NextResponse.json({ message: "Failed to export bookings" }, { status: 500 });
    }
}
