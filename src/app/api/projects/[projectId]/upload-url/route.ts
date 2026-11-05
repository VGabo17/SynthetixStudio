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
  const { objectKey, contentType } = body;

  const project = await database
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const p = project[0];

  const { url, expiresAt } = await getR2PresignedUrl(
    env,
    env.R2 as unknown as string,
    objectKey,
    "PUT",
    300
  );

  await database
    .update(projects)
    .set({ r2_object_key: objectKey, updated_at: Date.now() })
    .where(eq(projects.id, projectId));

  return NextResponse.json({ url, expires_at: expiresAt, object_key: objectKey });
}
