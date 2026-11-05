import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

/** POST /api/auth/logout: ends this session (deletes it from the database and clears the cookie). */
export async function POST() {
    await signOut();
    return NextResponse.json({ message: "Signed out" }, { status: 200 });
}
