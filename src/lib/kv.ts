export async function getKV<KVEnv extends { KV: KVNamespace }>(
  env: KVEnv,
  key: string
): Promise<string | null> {
  return env.KV.get(key);
}

export async function setKV<KVEnv extends { KV: KVNamespace }>(
  env: KVEnv,
  key: string,
  value: string,
  options?: { expirationTtl?: number }
): Promise<void> {
  await env.KV.put(key, value, options);
}

export async function deleteKV<KVEnv extends { KV: KVNamespace }>(
  env: KVEnv,
  key: string
): Promise<void> {
  await env.KV.delete(key);
}

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

export async function rateLimitTokenBucket(
  env: { KV: KVNamespace },
  key: string,
  capacity: number,
  refillPerSecond: number
): Promise<RateLimitResult> {
  const now = Date.now();
  const storeKey = `ratelimit:${key}`;
  const raw = await env.KV.get(storeKey);
  let tokens: number;
  let lastRefill: number;

  if (raw === null) {
    tokens = capacity - 1;
    lastRefill = now;
  } else {
    const parsed = JSON.parse(raw) as { tokens: number; lastRefill: number };
    const elapsed = (now - parsed.lastRefill) / 1000;
    tokens = Math.min(capacity, parsed.tokens + elapsed * refillPerSecond);
    lastRefill = parsed.lastRefill;
    if (tokens < 1) {
      return { allowed: false, remaining: 0, resetAt: lastRefill + (1 / refillPerSecond) * 1000 };
    }
    tokens -= 1;
  }

  await env.KV.put(storeKey, JSON.stringify({ tokens, lastRefill }), { expirationTtl: 3600 });
  return { allowed: true, remaining: Math.floor(tokens), resetAt: now + 60000 };
}
