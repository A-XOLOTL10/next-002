import { NextRequest, NextResponse } from "next/server";
import { signInAdmin } from "@/lib/auth";

/**
 * POST /api/auth/login: admin sign-in for API clients such as Postman.
 * Body: JSON { "email": "...", "password": "..." } or form-data with the same fields.
 * On success it sets the same httpOnly session cookie the website uses; Postman keeps
 * it automatically, so later POST/PUT/DELETE calls to /api/events are authorized.
 */
export async function POST(req: NextRequest) {
    let email: unknown;
    let password: unknown;
    try {
        if (req.headers.get("content-type")?.includes("application/json")) {
            ({ email, password } = (await req.json()) as { email?: unknown; password?: unknown });
        } else {
            const formData = await req.formData();
            email = formData.get("email");
            password = formData.get("password");
        }
    } catch {
        return NextResponse.json({ message: "Send JSON or form-data with email and password" }, { status: 400 });
    }

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        return NextResponse.json({ message: "email and password are required" }, { status: 400 });
    }

    switch (await signInAdmin(email, password)) {
        case "ok":
            return NextResponse.json({ message: "Signed in" }, { status: 200 });
        case "invalid":
            return NextResponse.json({ message: "Invalid email or password" }, { status: 401 });
        case "locked":
            return NextResponse.json({ message: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
        case "unconfigured":
            return NextResponse.json({ message: "Admin login isn't configured on the server" }, { status: 500 });
    }
}
