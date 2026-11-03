import { NextResponse } from "next/server";
import { deleteSession } from "@/lib/auth";

/** POST /api/auth/logout: clears the admin session cookie. */
export async function POST() {
    await deleteSession();
    return NextResponse.json({ message: "Signed out" }, { status: 200 });
}
