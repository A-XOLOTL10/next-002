import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { OAUTH_COOKIE } from "@/lib/session-cookies";
import { authorizationUrl, isOAuthProvider, oauthConfigured } from "@/lib/oauth";
import { randomToken, sign } from "@/lib/crypto";

/**
 * GET /api/oauth/google (or /github): starts "Sign in with Google/GitHub".
 * Remembers a random state and PKCE verifier in a short-lived signed cookie, then sends the
 * browser to the provider. The callback route checks both before trusting anything it receives.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]">) {
    const { provider } = await ctx.params;
    const loginUrl = new URL("/host/login", req.url);

    if (!isOAuthProvider(provider) || !oauthConfigured(provider)) {
        loginUrl.searchParams.set("error", "provider_unavailable");
        return NextResponse.redirect(loginUrl);
    }

    const next = req.nextUrl.searchParams.get("next");
    const state = randomToken(16);
    const verifier = randomToken(48);
    const payload = Buffer.from(
        JSON.stringify({
            provider,
            state,
            verifier,
            next: next && next.startsWith("/host") && !next.startsWith("//") ? next.slice(0, 300) : null,
            expiresAt: Date.now() + 10 * 60 * 1000,
        }),
    ).toString("base64url");

    let destination: string;
    try {
        destination = authorizationUrl(provider, { state, verifier });
    } catch (e) {
        console.error("OAuth start failed:", e);
        loginUrl.searchParams.set("error", "provider_unavailable");
        return NextResponse.redirect(loginUrl);
    }

    // httpOnly + signed: the page's scripts can't read it and nobody can forge it.
    // sameSite "lax" is needed: the provider sends the browser back with a top-level GET.
    (await cookies()).set(OAUTH_COOKIE, `${payload}.${sign("oauth", payload)}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/oauth",
        maxAge: 10 * 60,
    });

    return NextResponse.redirect(destination);
}
