import { db, getDb } from "@/db";
import { sessions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateSecureToken, generateUuidV4 } from "@/lib/crypto";
import { createTokenPair, TokenPair } from "@/lib/jwt";

type Env = {
  DB: D1Database;
  KV: KVNamespace;
};

export async function createSession(
  env: Env,
  userId: string,
  role: string,
  ipAddress: string,
  userAgent: string
): Promise<TokenPair & { user_id: string }> {
  const database = getDb(env);
  const session_id = generateUuidV4();
  const refresh_token = generateSecureToken();
  const now = Date.now();
  const access_expires_at = now + 900 * 1000;
  const refresh_expires_at = now + 7 * 24 * 60 * 60 * 1000;

  const pair = await createTokenPair(env, userId, role, session_id);

  await database.insert(sessions).values({
    id: session_id,
    user_id: userId,
    refresh_token,
    session_id,
    expires_at: refresh_expires_at,
    revoked: 0,
    created_at: now,
  });

  await database.insert(auditLogs).values({
    id: generateSecureToken(16),
    user_id: userId,
    action: "SESSION_CREATED",
    entity_type: "session",
    entity_id: session_id,
    metadata: JSON.stringify({ ip_address: ipAddress, user_agent: userAgent }),
    ip_address: ipAddress,
    user_agent: userAgent,
    created_at: now,
  });

  return { ...pair, user_id: userId };
}

export async function revokeSession(env: Env, sessionId: string): Promise<void> {
  const database = getDb(env);
  await database
    .update(sessions)
    .set({ revoked: 1 })
    .where(eq(sessions.session_id, sessionId));

  const remainingTtl = Math.floor(900 * 1000 / 1000);
  await env.KV.put(`revoked_session:${sessionId}`, "1", { expirationTtl: remainingTtl });
}

export async function isSessionRevoked(env: Env, sessionId: string): Promise<boolean> {
  const val = await env.KV.get(`revoked_session:${sessionId}`);
  return val !== null;
}

export async function rotateRefreshToken(
  env: Env,
  oldRefreshToken: string
): Promise<TokenPair | null> {
  const database = getDb(env);
  const existing = await database
    .select()
    .from(sessions)
    .where(eq(sessions.refresh_token, oldRefreshToken))
    .limit(1);

  if (existing.length === 0) return null;
  const session = existing[0];
  if (session.revoked === 1) return null;
  if (Date.now() > session.expires_at) return null;

  const revoked = await isSessionRevoked(env, session.session_id);
  if (revoked) return null;

  await revokeSession(env, session.session_id);

  const user = await database.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
  const pair = await createTokenPair(env, session.user_id, "CLIENT", generateUuidV4());

  await database.insert(sessions).values({
    id: pair.session_id,
    user_id: session.user_id,
    refresh_token: pair.refresh_token,
    session_id: pair.session_id,
    expires_at: pair.refresh_expires_at,
    revoked: 0,
    created_at: Date.now(),
  });

  return pair;
}
