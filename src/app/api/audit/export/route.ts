import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "1000", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const logs = await database
    .select({
      id: auditLogs.id,
      user_id: auditLogs.user_id,
      action: auditLogs.action,
      entity_type: auditLogs.entity_type,
      entity_id: auditLogs.entity_id,
      metadata: auditLogs.metadata,
      ip_address: auditLogs.ip_address,
      user_agent: auditLogs.user_agent,
      created_at: auditLogs.created_at,
      user_email: users.email,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.user_id, users.id))
    .orderBy(auditLogs.created_at)
    .limit(limit)
    .offset(offset);

  const csvHeader = "id,user_id,user_email,action,entity_type,entity_id,metadata,ip_address,user_agent,created_at\n";
  const csvRows = logs.map((log) =>
    `${log.id},${log.user_id ?? ""},"${log.user_email ?? ""}","${log.action}","${log.entity_type}",${log.entity_id ?? ""},"${log.metadata ?? ""}","${log.ip_address ?? ""}","${log.user_agent ?? ""}",${log.created_at}`
  ).join("\n");

  return new NextResponse(csvHeader + csvRows, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit_logs_${Date.now()}.csv"`,
    },
  });
}
