import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, payments, users } from "@/db/schema";
import { eq } from "drizzle-orm";

type Env = {
  DB: D1Database;
};

export const runtime = "edge";

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);
  const { projectId } = params;

  const project = await database
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (project.length === 0) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const p = project[0];

  const client = await database
    .select()
    .from(users)
    .where(eq(users.id, p.client_id))
    .limit(1);

  const projectPayments = await database
    .select()
    .from(payments)
    .where(eq(payments.project_id, projectId));

  const invoice = {
    invoice_id: `INV-${projectId.slice(0, 8)}`,
    project_id: p.id,
    client: client[0] ? { id: client[0].id, email: client[0].email } : null,
    title: p.title,
    status: p.status,
    total_amount: p.total_amount,
    currency: "usd",
    first_paid: Boolean(p.first_paid),
    final_paid: Boolean(p.final_paid),
    escrow_held: Boolean(p.escrow_held),
    escrow_released: Boolean(p.escrow_released),
    progress_percentage: p.progress_percentage,
    payments: projectPayments.map((pay) => ({
      id: pay.id,
      amount: pay.amount,
      currency: pay.currency,
      milestone: pay.milestone,
      status: pay.status,
      paid_at: pay.paid_at,
    })),
    issued_at: p.created_at,
    updated_at: p.updated_at,
  };

  return NextResponse.json({ invoice });
}
