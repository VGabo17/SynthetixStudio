import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { projects, payments, users, auditLogs, licenses } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";

type Env = {
  DB: D1Database;
};

export const runtime = "edge";

export async function GET(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env ?? ({} as Env);
  const database = getDb(env);

  const roleHeader = request.headers.get("x-user-role");
  if (roleHeader !== "SUPER_ADMIN" && roleHeader !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const totalProjects = await database
    .select({ count: sql`count(*)`.as("count") })
    .from(projects);

  const activeProjects = await database
    .select({ count: sql`count(*)`.as("count") })
    .from(projects)
    .where(eq(projects.status, "IN_DEVELOPMENT"));

  const completedProjects = await database
    .select({ count: sql`count(*)`.as("count") })
    .from(projects)
    .where(eq(projects.status, "COMPLETED"));

  const revenue30d = await database
    .select({ total: sql`coalesce(sum(amount), 0)`.as("total") })
    .from(payments)
    .where(and(eq(payments.status, "COMPLETED"), gte(payments.paid_at, thirtyDaysAgo)));

  const pendingPayments = await database
    .select({ count: sql`count(*)`.as("count") })
    .from(payments)
    .where(eq(payments.status, "PENDING"));

  const activeLicenses = await database
    .select({ count: sql`count(*)`.as("count") })
    .from(licenses)
    .where(eq(licenses.status, "ACTIVE"));

  const totalUsers = await database
    .select({ count: sql`count(*)`.as("count") })
    .from(users);

  const metrics = {
    total_projects: Number(totalProjects[0]?.count ?? 0),
    active_projects: Number(activeProjects[0]?.count ?? 0),
    completed_projects: Number(completedProjects[0]?.count ?? 0),
    revenue_30d_cents: Number(revenue30d[0]?.total ?? 0),
    pending_payments: Number(pendingPayments[0]?.count ?? 0),
    active_licenses: Number(activeLicenses[0]?.count ?? 0),
    total_users: Number(totalUsers[0]?.count ?? 0),
    generated_at: now,
  };

  return NextResponse.json(metrics);
}
