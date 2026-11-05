import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { payments, projects, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hmacSha256Sign, generateSecureToken } from "@/lib/crypto";
import { z } from "zod";

const cryptomusSchema = z.object({
  order_id: z.string(),
  amount: z.string(),
  currency: z.string(),
  status: z.string(),
  sign: z.string(),
});

type Env = {
  DB: D1Database;
  CRYPTOMUS_WEBHOOK_SECRET: string;
};

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);
  const rawBody = await request.text();
  const signature = request.headers.get("sign") ?? "";

  const data = JSON.parse(rawBody);
  const parsed = cryptomusSchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = { ...parsed.data };
  delete payload.sign;
  const signString = JSON.stringify(payload);
  const expectedSign = await hmacSha256Sign(env.CRYPTOMUS_WEBHOOK_SECRET, signString);

  if (expectedSign !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const idempotencyKey = `cryptomus:${parsed.data.order_id}`;

  const existing = await database
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.idempotency_key, idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    await database.insert(auditLogs).values({
      id: generateSecureToken(16),
      action: "CRYPTOMUS_WEBHOOK_DUPLICATE",
      entity_type: "payment",
      entity_id: existing[0].id,
      metadata: JSON.stringify({ order_id: parsed.data.order_id }),
      created_at: Date.now(),
    });
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  const amountCents = Math.round(parseFloat(parsed.data.amount) * 100);
  const projectId = parsed.data.order_id;

  const project = await database
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const targetProject = project[0];
  const milestone = amountCents >= targetProject.total_amount / 2 ? "SECOND_50" : "FIRST_50";

  await database.transaction(async (tx) => {
    await tx.insert(payments).values({
      id: generateSecureToken(16),
      project_id: projectId,
      stripe_payment_intent_id: parsed.data.order_id,
      amount: amountCents,
      currency: parsed.data.currency.toLowerCase(),
      status: "COMPLETED",
      idempotency_key: idempotencyKey,
      milestone: milestone as "FIRST_50" | "SECOND_50",
      paid_at: Date.now(),
      created_at: Date.now(),
    });

    await tx.insert(auditLogs).values({
      id: generateSecureToken(16),
      action: "CRYPTOMUS_PAYMENT_COMPLETED",
      entity_type: "payment",
      entity_id: parsed.data.order_id,
      metadata: JSON.stringify({ project_id: projectId, milestone, amount: amountCents }),
      created_at: Date.now(),
    });

    if (milestone === "FIRST_50") {
      await tx
        .update(projects)
        .set({ status: "IN_DEVELOPMENT", first_paid: 1, progress_percentage: 25, updated_at: Date.now() })
        .where(eq(projects.id, projectId));
    } else if (milestone === "SECOND_50") {
      if (targetProject.progress_percentage === 100 && targetProject.final_paid === 0) {
        await tx
          .update(projects)
          .set({ status: "COMPLETED", final_paid: 1, progress_percentage: 100, updated_at: Date.now() })
          .where(eq(projects.id, projectId));
      }
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}
