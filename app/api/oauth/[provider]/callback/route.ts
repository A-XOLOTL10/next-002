import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { OAUTH_COOKIE } from "@/lib/session-cookies";
import { fetchProfile, isOAuthProvider } from "@/lib/oauth";
import { safeEqual, verifySignature } from "@/lib/crypto";
import { signInWithOAuth } from "@/lib/accounts";
import { LIMITS, clientIp, consumeAttempt } from "@/lib/rate-limit";

type OAuthState = { provider: string; state: string; verifier: string; next: string | null; expiresAt: number };

/** Reads and checks the signed cookie set by /api/oauth/[provider]. Null if missing, forged or expired. */
async function readState(): Promise<OAuthState | null> {
    const jar = await cookies();
    const raw = jar.get(OAUTH_COOKIE)?.value;
    jar.delete({ name: OAUTH_COOKIE, path: "/api/oauth" }); // single use, whatever happens next
    if (!raw) return null;
    const [payload, signature] = raw.split(".");
    if (!payload || !signature || !verifySignature("oauth", payload, signature)) return null;
    try {
        const state = JSON.parse(Buffer.from(payload, "base64url").toString()) as OAuthState;
        return state.expiresAt > Date.now() ? state : null;
    } catch {
        return null;
    }
}

/**
 * GET /api/oauth/[provider]/callback: Google/GitHub send the browser back here.
 * Checks the state (stops forged sign-ins), exchanges the code with the PKCE verifier, reads the
 * verified email, then signs in or creates the host account. Errors go back to the login page
 * as a short code; details only go to the server log.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/oauth/[provider]/callback">) {
    const { provider } = await ctx.params;
    const params = req.nextUrl.searchParams;
    const fail = (code: string, message?: string) =>
        redirect(`/host/login?error=${code}${message ? `&message=${encodeURIComponent(message.slice(0, 200))}` : ""}`);

    if (!isOAuthProvider(provider)) fail("provider_unavailable");
    const saved = await readState();

    // The person pressed "Cancel" on the provider's page.
    if (params.get("error")) fail("cancelled");

    const code = params.get("code");
    const state = params.get("state");
    if (!saved || !code || !state || saved.provider !== provider || !safeEqual(state, saved.state)) fail("expired");
    if (!(await consumeAttempt(`oauth:${await clientIp()}`, LIMITS.login))) fail("too_many");

    let result: Awaited<ReturnType<typeof signInWithOAuth>>;
    try {
        const profile = await fetchProfile(provider as "google" | "github", { code: code!, verifier: saved!.verifier });
        result = await signInWithOAuth(profile, saved!.next);
    } catch (e) {
        console.error(`OAuth callback (${provider}) failed:`, e);
        return fail("provider_failed");
    }

    if (result.ok === false) return fail("refused", result.error);
    redirect(result.redirectTo);
}
