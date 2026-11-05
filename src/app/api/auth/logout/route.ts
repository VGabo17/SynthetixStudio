import { NextResponse } from "next/server";
import { z } from "zod";
import { revokeSession } from "@/lib/session";

type Env = {
  KV: KVNamespace;
  DB: D1Database;
};

const logoutSchema = z.object({
  session_id: z.string().min(1),
});

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env;
  const body = await request.json();
  const parsed = logoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await revokeSession(env, parsed.data.session_id);
  return NextResponse.json({ revoked: true });
}
