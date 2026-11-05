import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { payments, projects, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hmacSha256Verify, generateSecureToken } from "@/lib/crypto";
import { z } from "zod";

const paypalEventSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  resource: z.object({
    id: z.string(),
    amount: z.object({
      value: z.string(),
      currency_code: z.string(),
    }),
    custom: z.string().optional(),
  }),
});

type Env = {
  DB: D1Database;
  PAYPAL_WEBHOOK_SECRET: string;
};

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);
  const authHeader = request.headers.get("paypal-auth-algo");
  const certUrl = request.headers.get("paypal-cert-url");
  const transmissionId = request.headers.get("paypal-transmission-id");
  const transmissionSig = request.headers.get("paypal-transmission-sig");
  const transmissionTime = request.headers.get("paypal-transmission-time");

  if (!transmissionSig || !transmissionId || !transmissionTime) {
    return NextResponse.json({ error: "Missing PayPal signature headers" }, { status: 400 });
  }

  const rawBody = await request.text();
  const signedPayload = `${transmissionHeaders(): string}\n${rawBody}`;

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventResult = paypalEventSchema.safeParse(event);
  if (!eventResult.success) {
    return NextResponse.json({ error: "Invalid event schema" }, { status: 400 });
  }

  const paypalEvent = eventResult.data;
  const idempotencyKey = `paypal:${paypalEvent.id}`;

  const existing = await database
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.idempotency_key, idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    await database.insert(auditLogs).values({
      id: generateSecureToken(16),
      action: "PAYPAL_WEBHOOK_DUPLICATE",
      entity_type: "payment",
      entity_id: existing[0].id,
      metadata: JSON.stringify({ event_id: paypalEvent.id, type: paypalEvent.event_type }),
      created_at: Date.now(),
    });
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  const resource = paypalEvent.resource;
  const amountCents = Math.round(parseFloat(resource.amount.value) * 100);
  const projectId = resource.custom;

  if (!projectId || !amountCents) {
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

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
      stripe_payment_intent_id: resource.id,
      amount: amountCents,
      currency: resource.amount.currency_code.toLowerCase(),
      status: "COMPLETED",
      idempotency_key: idempotencyKey,
      milestone: milestone as "FIRST_50" | "SECOND_50",
      paid_at: Date.now(),
      created_at: Date.now(),
    });

    await tx.insert(auditLogs).values({
      id: generateSecureToken(16),
      action: "PAYPAL_PAYMENT_COMPLETED",
      entity_type: "payment",
      entity_id: resource.id,
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

function transmissionHeaders(): string {
  return "";
}
