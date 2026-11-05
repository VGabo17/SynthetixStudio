import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { sessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { rotateRefreshToken } from "@/lib/session";

type Env = {
  DB: D1Database;
  KV: KVNamespace;
};

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env;
  const body = await request.json();
  const parsed = refreshSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const pair = await rotateRefreshToken(env, parsed.data.refresh_token);
  if (!pair) {
    return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
  }

  return NextResponse.json({
    access_token: pair.access_token,
    refresh_token: pair.refresh_token,
    session_id: pair.session_id,
    access_expires_at: pair.access_expires_at,
  });
}
