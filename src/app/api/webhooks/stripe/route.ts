import { NextResponse } from "next/server";
import { getDb } from "@/database";
import { payments, projects, auditLogs } from "@/database/schema";
import { eq } from "drizzle-orm";
import { hmacSha256Verify, generateSecureToken } from "@/lib/crypto";
import { z } from "zod";

const stripeEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    object: z.object({
      id: z.string(),
      amount: z.number(),
      currency: z.string(),
      metadata: z.record(z.string()).optional(),
    }),
  }),
});

type Env = {
  DB: D1Database;
  STRIPE_WEBHOOK_SECRET: string;
};

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);
  const signatureHeader = request.headers.get("stripe-signature");
  if (!signatureHeader) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  const parsed = parseStripeSignature(signatureHeader);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid stripe-signature format" }, { status: 400 });
  }

  const { timestamp, signatures } = parsed;
  const now = Math.floor(Date.now() / 1000);
  const tolerance = 300;
  if (Math.abs(now - timestamp) > tolerance) {
    return NextResponse.json({ error: "Timestamp outside tolerance" }, { status: 400 });
  }

  const signedPayload = `${timestamp}.${rawBody}`;
  const valid = await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, signedPayload, signatures);
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventResult = stripeEventSchema.safeParse(event);
  if (!eventResult.success) {
    return NextResponse.json({ error: "Invalid event schema" }, { status: 400 });
  }

  const stripeEvent = eventResult.data;
  const idempotencyKey = `stripe:${stripeEvent.id}`;

  const existing = await database
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.idempotency_key, idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    await database.insert(auditLogs).values({
      id: generateSecureToken(16),
      action: "STRIPE_WEBHOOK_DUPLICATE",
      entity_type: "payment",
      entity_id: existing[0].id,
      metadata: JSON.stringify({ event_id: stripeEvent.id, type: stripeEvent.type }),
      created_at: Date.now(),
    });
    return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
  }

  const paymentIntent = stripeEvent.data.object;
  if (!paymentIntent || !paymentIntent.id) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const projectId = paymentIntent.metadata?.project_id;
  const milestone = paymentIntent.metadata?.milestone;
  const amount = paymentIntent.amount;
  const currency = paymentIntent.currency;

  if (!projectId || !milestone || !amount) {
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

  await database.transaction(async (tx) => {
    await tx.insert(payments).values({
      id: generateSecureToken(16),
      project_id: projectId,
      stripe_payment_intent_id: paymentIntent.id,
      amount,
      currency,
      status: "COMPLETED",
      idempotency_key: idempotencyKey,
      milestone: milestone as "FIRST_50" | "SECOND_50",
      paid_at: Date.now(),
      created_at: Date.now(),
    });

    await tx.insert(auditLogs).values({
      id: generateSecureToken(16),
      action: "STRIPE_PAYMENT_COMPLETED",
      entity_type: "payment",
      entity_id: paymentIntent.id,
      metadata: JSON.stringify({
        project_id: projectId,
        milestone,
        amount,
        currency,
        event_id: stripeEvent.id,
      }),
      created_at: Date.now(),
    });

    if (milestone === "FIRST_50") {
      await tx
        .update(projects)
        .set({
          status: "IN_DEVELOPMENT",
          first_paid: 1,
          progress_percentage: 25,
          updated_at: Date.now(),
        })
        .where(eq(projects.id, projectId));
    } else if (milestone === "SECOND_50") {
      const canRelease =
        targetProject.progress_percentage === 100 &&
        targetProject.final_paid === 0;

      if (canRelease) {
        await tx
          .update(projects)
          .set({
            status: "COMPLETED",
            final_paid: 1,
            progress_percentage: 100,
            updated_at: Date.now(),
          })
          .where(eq(projects.id, projectId));
      }
    }
  });

  return NextResponse.json({ received: true }, { status: 200 });
}

function parseStripeSignature(header: string): { timestamp: number; signatures: string[] } | null {
  const parts = header.split(",");
  let timestamp: number | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") {
      timestamp = parseInt(value, 10);
    } else if (key === "v1") {
      signatures.push(value);
    }
  }

  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

async function verifyStripeSignature(
  secret: string,
  signedPayload: string,
  signatures: string[]
): Promise<boolean> {
  for (const sig of signatures) {
    const valid = await hmacSha256Verify(secret, signedPayload, sig);
    if (valid) return true;
  }
  return false;
}
