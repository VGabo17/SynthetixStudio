import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getR2PresignedUrl } from "@/lib/r2";

type Env = {
  DB: D1Database;
  R2: R2Bucket;
};

export const runtime = "edge";

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);
  const { projectId } = params;

  const body = await request.json();
  const clientId = body.client_id;

  const project = await database
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const p = project[0];

  if (p.client_id !== clientId) {
    return NextResponse.json({ error: "Unauthorized client" }, { status: 403 });
  }

  if (p.final_paid !== 1 || p.progress_percentage !== 100) {
    return NextResponse.json({ error: "Project not fully paid or not complete" }, { status: 403 });
  }

  if (!p.r2_object_key) {
    return NextResponse.json({ error: "No deliverable uploaded" }, { status: 404 });
  }

  const { url, expiresAt } = await getR2PresignedUrl(env, env.R2 as unknown as string, p.r2_object_key, "GET", 300);

  return NextResponse.json({ url, expires_at: expiresAt });
}
