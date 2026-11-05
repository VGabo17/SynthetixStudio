import { SignJWT, jwtVerify, JWTPayload } from "jose";
import { getEnvKeys, generateSecureToken, generateUuidV4, signJwt, verifyJwt } from "./crypto";

const ACCESS_TTL_SECONDS = parseInt(
  (typeof process !== "undefined" && process.env.JWT_ACCESS_TTL_SECONDS)
    ? process.env.JWT_ACCESS_TTL_SECONDS
    : "900",
  10
);

export type SessionPayload = {
  sub: string;
  role: string;
  session_id: string;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  session_id: string;
  access_expires_at: number;
  refresh_expires_at: number;
};

export async function createTokenPair(
  env: { JWT_PRIVATE_KEY?: CryptoKey; JWT_PUBLIC_KEY?: CryptoKey },
  userId: string,
  role: string,
  sessionId?: string
): Promise<TokenPair> {
  const { privateKey } = getEnvKeys(env);
  const session_id = sessionId ?? generateUuidV4();
  const now = Math.floor(Date.now() / 1000);
  const access_expires_at = now + ACCESS_TTL_SECONDS;

  const access_token = await signJwt(
    { sub: userId, role, session_id },
    privateKey,
    ACCESS_TTL_SECONDS
  );
  const refresh_token = generateSecureToken();

  return { access_token, refresh_token, session_id, access_expires_at, refresh_expires_at: now + 604800 };
}

export async function verifyAccessToken(
  env: { JWT_PUBLIC_KEY?: CryptoKey },
  token: string
): Promise<JWTPayload | null> {
  try {
    const { publicKey } = getEnvKeys(env);
    const { payload } = await verifyJwt(token, publicKey);
    return payload;
  } catch {
    return null;
  }
}
