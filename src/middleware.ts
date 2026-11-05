import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyAccessToken } from "./lib/jwt";
import { isSessionRevoked } from "./lib/session";
import { rateLimitTokenBucket } from "./lib/kv";

const PUBLIC_PATHS = [
  "/api/webhooks",
  "/api/auth",
  "/api/v1/license/verify",
  "/_next",
  "/favicon.ico",
];

export async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const env = (request as unknown as { env?: { KV: KVNamespace; JWT_PUBLIC_KEY?: CryptoKey } }).env;
  const kv = env?.KV;

  const rateLimitKey = request.ip ?? "anonymous";
  const rate = await rateLimitTokenBucket({ KV: kv as KVNamespace }, `ip:${rateLimitKey}`, 60, 1);
  if (!rate.allowed) {
    return new NextResponse(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/dashboard")) {
    const token = request.cookies.get("access_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = await verifyAccessToken(
      { JWT_PUBLIC_KEY: env?.JWT_PUBLIC_KEY },
      token
    );
    if (!payload) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const sessionId = (payload as { session_id?: string }).session_id;
    if (sessionId && kv && (await isSessionRevoked({ KV: kv } as unknown as { KV: KVNamespace }, sessionId))) {
      return NextResponse.json({ error: "Session revoked" }, { status: 401 });
    }

    const response = NextResponse.next();
    response.headers.set("x-user-id", (payload as { sub?: string }).sub ?? "");
    response.headers.set("x-user-role", (payload as { role?: string }).role ?? "");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
