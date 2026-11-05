import { NextRequest, NextResponse } from "next/server";
import { signInForApi } from "@/lib/auth";

/**
 * POST /api/auth/login: admin sign-in for API clients such as Postman.
 * Body: JSON { "email": "...", "password": "...", "code": "123456" } or form-data with the same
 * fields. `code` is the 6-digit authenticator code (required: team accounts always use one).
 * On success it sets the same httpOnly session cookie the website uses; Postman keeps it, so
 * later POST/PUT/DELETE calls to /api/events are authorized.
 */
export async function POST(req: NextRequest) {
    let email: unknown;
    let password: unknown;
    let code: unknown;
    try {
        if (req.headers.get("content-type")?.includes("application/json")) {
            ({ email, password, code } = (await req.json()) as { email?: unknown; password?: unknown; code?: unknown });
        } else {
            const formData = await req.formData();
            email = formData.get("email");
            password = formData.get("password");
            code = formData.get("code");
        }
    } catch {
        return NextResponse.json({ message: "Send JSON or form-data with email, password and code" }, { status: 400 });
    }

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        return NextResponse.json({ message: "email and password are required" }, { status: 400 });
    }

    switch (await signInForApi(email, password, typeof code === "string" ? code : undefined)) {
        case "ok":
            return NextResponse.json({ message: "Signed in" }, { status: 200 });
        case "invalid":
            return NextResponse.json({ message: "Invalid email, password or code" }, { status: 401 });
        case "code_required":
            return NextResponse.json({ message: "An authenticator code is required. Set one up on the website (Security page) first." }, { status: 401 });
        case "locked":
            return NextResponse.json({ message: "Too many failed attempts. Try again in 15 minutes." }, { status: 429 });
    }
}
