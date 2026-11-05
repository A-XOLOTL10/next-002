import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { actorOf, getSession } from "@/lib/auth";
import { isAdminRole } from "@/database/user.constants";
import { readPrivateFile } from "@/lib/documents";
import { logAction } from "@/lib/audit";

/**
 * GET /api/console/files/[id]: opens one private document (ID, company paper, signed letter)
 * for an admin. Every view is written to the activity log. The response is never cached, can't be
 * framed by another site, and the browser must not guess its type.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/console/files/[id]">) {
    const session = await getSession();
    if (!session || !isAdminRole(session.user.role) || !session.user.totpEnabled) {
        return new NextResponse("Not found", { status: 404 }); // don't confirm the file exists
    }

    const { id } = await ctx.params;
    let file;
    try {
        await connectDB();
        file = await readPrivateFile(id);
    } catch (e) {
        console.error("Private file read failed:", e);
        return new NextResponse("Couldn't open this document", { status: 500 });
    }
    if (!file) return new NextResponse("Not found", { status: 404 });

    await logAction({
        actor: actorOf(session),
        category: "security",
        action: "document.view",
        summary: `${session.user.name} opened a ${file.purpose.replace("_", " ")} (${file.filename})`,
        target: { type: "document", id, label: file.filename },
        details: { ownerId: file.ownerId },
    });

    return new NextResponse(new Uint8Array(file.bytes), {
        headers: {
            "Content-Type": file.contentType,
            "Content-Disposition": `inline; filename="${file.filename.replace(/"/g, "")}"`,
            "Cache-Control": "no-store, private",
            "X-Content-Type-Options": "nosniff",
            // Only ever PDF/PNG/JPEG (checked on upload): nothing here can run scripts on our site.
            // (A CSP "sandbox" would also stop Chrome's built-in PDF viewer, so it isn't used.)
            "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
            "Referrer-Policy": "no-referrer",
        },
    });
}
