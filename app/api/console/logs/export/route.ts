import { NextRequest, NextResponse } from "next/server";
import { actorOf, getSession } from "@/lib/auth";
import { exportLogs, parseLogFilters, rangeWindow } from "@/lib/logs-data";
import { logAction } from "@/lib/audit";

/** One CSV cell: quoted, inner quotes doubled, and formula-looking values defused for spreadsheets. */
const cell = (value: unknown): string => {
    let text = value === undefined || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};

/**
 * GET /api/console/logs/export?...: the activity log as CSV, with the same filters as the page.
 * Super admin only, and the export itself is logged (exports leave the system).
 */
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.user.role !== "super_admin" || !session.user.totpEnabled) return new NextResponse("Not found", { status: 404 });

    const filters = parseLogFilters(Object.fromEntries(req.nextUrl.searchParams));
    const rows = await exportLogs(filters);
    const { start, end } = rangeWindow(filters);

    const header = ["Time (UTC)", "Severity", "Category", "Action", "Summary", "Who", "Email", "Role", "Target", "IP", "Country", "Source", "Approved fingerprint", "Details"];
    const lines = rows.map((r) => [r.at, r.severity, r.category, r.action, r.summary, r.actorName, r.actorEmail, r.actorRole, r.target ? `${r.target.type}: ${r.target.label ?? r.target.id ?? ""}` : "", r.ip, r.country, r.source, r.snapshotHash, r.details].map(cell).join(","));
    // A byte-order mark so Excel opens the file as UTF-8.
    const csv = "﻿" + [header.map(cell).join(","), ...lines].join("\r\n");

    await logAction({ actor: actorOf(session), category: "security", action: "log.export", severity: "warning", summary: `${session.user.name} exported ${rows.length} activity log entries`, details: { from: start.toISOString(), to: end.toISOString(), category: filters.category, severity: filters.severity } });

    return new NextResponse(csv, {
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="activity-log-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv"`,
            "Cache-Control": "no-store, private",
        },
    });
}
