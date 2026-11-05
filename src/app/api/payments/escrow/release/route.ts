import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { escrowHolds, projects, payments, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { generateSecureToken } from "@/lib/crypto";

type Env = {
  DB: D1Database;
};

const releaseSchema = z.object({
  project_id: z.string(),
  admin_user_id: z.string(),
});

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);
  const body = await request.json();
  const parsed = releaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { project_id, admin_user_id } = parsed.data;

  const project = await database
    .select()
    .from(projects)
    .where(eq(projects.id, project_id))
    .limit(1);

  if (project.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const p = project[0];
  if (p.final_paid !== 1 || p.progress_percentage !== 100) {
    return NextResponse.json({ error: "Project not eligible for escrow release" }, { status: 403 });
  }
  if (p.escrow_released === 1) {
    return NextResponse.json({ error: "Escrow already released" }, { status: 400 });
  }

  const hold = await database
    .select()
    .from(escrowHolds)
    .where(and(eq(escrowHolds.project_id, project_id), eq(escrowHolds.status, "HELD")))
    .limit(1);

  if (hold.length === 0) {
    return NextResponse.json({ error: "No active escrow hold" }, { status: 404 });
  }

  await database.transaction(async (tx) => {
    await tx
      .update(escrowHolds)
      .set({ status: "RELEASED", released_at: Date.now() })
      .where(eq(escrowHolds.id, hold[0].id));

    await tx
      .update(projects)
      .set({ escrow_released: 1, status: "DELIVERED", updated_at: Date.now() })
      .where(eq(projects.id, project_id));

    await tx.insert(auditLogs).values({
      id: generateSecureToken(16),
      user_id: admin_user_id,
      action: "ESCROW_RELEASED",
      entity_type: "project",
      entity_id: project_id,
      metadata: JSON.stringify({ escrow_hold_id: hold[0].id, amount: hold[0].amount }),
      created_at: Date.now(),
    });
  });

  return NextResponse.json({ released: true, project_id });
}
