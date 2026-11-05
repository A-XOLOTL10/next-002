import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import AuditLog, { ActivityDay, LOG_RETENTION_DAYS } from "@/database/audit-log.model";
import { getSession } from "@/lib/auth";
import { isAdminRole } from "@/database/user.constants";
import { getRequestInfo } from "@/lib/request-info";
import { LIMITS, consumeAttempt } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 20_000;
const MAX_EVENTS = 50;

type Incoming = { type?: unknown; path?: unknown; label?: unknown; seconds?: unknown; at?: unknown };

/**
 * POST /api/console/activity: the console's browsing trail (components/admin/ActivityTracker).
 * Admin sessions only. Everything is treated as untrusted input: types, lengths and counts are
 * checked, entries are marked source "client", and active time per request is capped so a
 * forged request can't claim hours of work.
 */
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !isAdminRole(session.user.role)) return new NextResponse(null, { status: 204 });
    if (!(await consumeAttempt(`activity:${session.user.id}`, LIMITS.activity))) return new NextResponse(null, { status: 204 });

    let events: Incoming[];
    try {
        const raw = await req.text();
        if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });
        const parsed = JSON.parse(raw) as { events?: unknown };
        events = Array.isArray(parsed.events) ? (parsed.events as Incoming[]).slice(0, MAX_EVENTS) : [];
    } catch {
        return new NextResponse(null, { status: 400 });
    }

    const clean = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, "").slice(0, max) : "");
    const info = await getRequestInfo();
    const now = Date.now();
    const entries = [];
    let activeSeconds = 0;

    for (const event of events) {
        const at = typeof event.at === "number" && Math.abs(now - event.at) < 10 * 60_000 ? new Date(event.at) : new Date();
        const path = clean(event.path, 200);
        if (event.type === "page" && path.startsWith("/host")) {
            entries.push({ summary: `${session.user.name} opened ${path}`, action: "nav.page", at, details: { path } });
        } else if (event.type === "click") {
            const label = clean(event.label, 60);
            if (label) entries.push({ summary: `${session.user.name} clicked "${label}" on ${path}`, action: "nav.click", at, details: { path, label } });
        } else if (event.type === "active" && typeof event.seconds === "number") {
            activeSeconds += Math.min(Math.max(event.seconds, 0), 60);
        }
    }
    activeSeconds = Math.min(activeSeconds, 120); // one batch covers at most ~20 s; allow slack, never hours

    try {
        await connectDB();
        if (entries.length > 0) {
            await AuditLog.insertMany(
                entries.map((entry) => ({
                    ...entry,
                    actorId: session.user.id,
                    actorEmail: session.user.email,
                    actorName: session.user.name,
                    actorRole: session.user.role,
                    sessionId: session.sessionId,
                    category: "navigation",
                    severity: "info",
                    ip: info.ip,
                    country: info.country,
                    userAgent: info.userAgent,
                    source: "client",
                })),
            );
        }
        if (activeSeconds > 0) {
            const day = new Date().toISOString().slice(0, 10);
            await ActivityDay.updateOne(
                { userId: session.user.id, day },
                { $inc: { activeSeconds }, $setOnInsert: { expiresAt: new Date(now + LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000) } },
                { upsert: true },
            );
        }
    } catch (e) {
        console.error("Activity write failed:", e);
    }
    return new NextResponse(null, { status: 204 });
}
