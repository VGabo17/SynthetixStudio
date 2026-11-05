import { NextResponse } from "next/server";
import { db } from "@/db";
import { licenses, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { verifyEd25519, arrayBufferToBase64Url, base64UrlToArrayBuffer, generateSecureToken } from "@/lib/crypto";

type Env = {
  DB: D1Database;
  KV: KVNamespace;
  LICENSE_PRIVATE_KEY: CryptoKey;
  LICENSE_PUBLIC_KEY: CryptoKey;
  NOW: number;
};

const verifySchema = z.object({
  license_key: z.string().min(1),
  machine_hwid: z.string().min(1),
  nonce: z.string().min(1),
  timestamp: z.number(),
});

const LICENSE_TOLERANCE_SECONDS = 60;

export const runtime = "edge";

export async function POST(request: Request): Promise<NextResponse> {
  const env = request.env as unknown as Env;
  const now = env.NOW ?? Math.floor(Date.now() / 1000);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const { license_key, machine_hwid, nonce, timestamp } = parsed.data;

  const clientIp = request.headers.get("x-forwarded-for") ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  if (Math.abs(now - timestamp) > LICENSE_TOLERANCE_SECONDS) {
    await logAudit(env, null, "LICENSE_REPLAY_TIMESTAMP", "license", license_key, {
      client_ip: clientIp,
      reason: "timestamp_outside_tolerance",
    });
    return NextResponse.json({ error: "Timestamp outside tolerance" }, { status: 403 });
  }

  const nonceKey = `license_nonce:${nonce}`;
  const existingNonce = await env.KV.get(nonceKey);
  if (existingNonce !== null) {
    await logAudit(env, null, "LICENSE_REPLAY_NONCE", "license", license_key, {
      client_ip: clientIp,
      reason: "nonce_already_used",
    });
    return NextResponse.json({ error: "Nonce already used" }, { status: 403 });
  }
  await env.KV.put(nonceKey, "1", { expirationTtl: 120 });

  const licenseRow = await db
    .select()
    .from(licenses)
    .where(eq(licenses.license_key, license_key))
    .limit(1);

  if (licenseRow.length === 0) {
    await logAudit(env, null, "LICENSE_NOT_FOUND", "license", license_key, {
      client_ip: clientIp,
      reason: "license_key_not_found",
    });
    return NextResponse.json({ error: "License not found" }, { status: 404 });
  }

  const license = licenseRow[0];

  if (license.status !== "ACTIVE") {
    await logAudit(env, license.client_id, "LICENSE_NOT_ACTIVE", "license", license_key, {
      client_ip: clientIp,
      reason: `status_${license.status}`,
    });
    return NextResponse.json({ error: "License not active" }, { status: 403 });
  }

  if (license.expires_at && now > license.expires_at / 1000) {
    await logAudit(env, license.client_id, "LICENSE_EXPIRED", "license", license_key, {
      client_ip: clientIp,
      reason: "license_expired",
    });
    return NextResponse.json({ error: "License expired" }, { status: 403 });
  }

  const hwidMatches = license.hwid ? license.hwid === machine_hwid : true;
  const isFloating = license.floating === 1;

  if (!hwidMatches && !isFloating) {
    await logAudit(env, license.client_id, "LICENSE_HWID_MISMATCH", "license", license_key, {
      client_ip: clientIp,
      expected_hwid: license.hwid,
      actual_hwid: machine_hwid,
      reason: "hardware_binding_mismatch",
    });
    return NextResponse.json({ error: "Hardware binding mismatch" }, { status: 403 });
  }

  const responsePayload = {
    license_key,
    status: "ACTIVE",
    floating: isFloating,
    client_id: license.client_id,
    project_id: license.project_id ?? null,
    timestamp: now,
    nonce,
  };

  const payloadJson = JSON.stringify(responsePayload);
  const signature = await signEd25519(new TextEncoder().encode(payloadJson), env.LICENSE_PRIVATE_KEY);
  const signatureB64 = arrayBufferToBase64Url(signature);

  await logAudit(env, license.client_id, "LICENSE_VERIFIED", "license", license_key, {
    client_ip: clientIp,
    hwid_match: hwidMatches,
    floating: isFloating,
  });

  return NextResponse.json(
    {
      valid: true,
      payload: responsePayload,
      signature: signatureB64,
    },
    { status: 200 }
  );
}

async function signEd25519(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, data));
}

async function logAudit(
  env: Env,
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: generateSecureToken(16),
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: JSON.stringify(metadata),
      ip_address: "unknown",
      user_agent: "unknown",
      created_at: Date.now(),
    });
  } catch {
    // Audit logging must not block the license response
  }
}
