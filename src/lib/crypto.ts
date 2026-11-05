import { SignJWT, jwtVerify, JWTVerifyResult } from "jose";

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_LENGTH = 16;
const TOKEN_BYTES = 32;

type Env = {
  JWT_PRIVATE_KEY?: CryptoKey;
  JWT_PUBLIC_KEY?: CryptoKey;
};

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicKey: CryptoKey | null = null;

export function getEnvKeys(env: Env): { privateKey: CryptoKey; publicKey: CryptoKey } {
  if (!cachedPrivateKey || !cachedPublicKey) {
    throw new Error("JWT keys not initialized. Call initJwtKeys first.");
  }
  return { privateKey: cachedPrivateKey, publicKey: cachedPublicKey };
}

export async function initJwtKeys(env: Env): Promise<void> {
  if (!cachedPrivateKey || !cachedPublicKey) {
    const generated = await generateEd25519KeyPair();
    cachedPrivateKey = generated.privateKey;
    cachedPublicKey = generated.publicKey;
  }
}

export async function generateEd25519KeyPair(): Promise<{
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}> {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  return { privateKey: pair.privateKey as CryptoKey, publicKey: pair.publicKey as CryptoKey };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_LENGTH));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const derived = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const hashBuffer = await crypto.subtle.sign("HMAC", derived, encoder.encode(password));
  const hashBytes = new Uint8Array(hashBuffer);
  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...hashBytes));
  return `${PBKDF2_ITERATIONS}:${saltB64}:${hashB64}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [iterationsStr, saltB64, hashB64] = storedHash.split(":");
  const iterations = parseInt(iterationsStr, 10);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const expectedHash = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  const derived = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const hashBuffer = await crypto.subtle.sign("HMAC", derived, encoder.encode(password));
  const actualHash = new Uint8Array(hashBuffer);
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash[i] ^ expectedHash[i];
  }
  return diff === 0;
}

export function generateSecureToken(length: number = TOKEN_BYTES): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateUuidV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function signJwt(
  payload: Record<string, unknown>,
  privateKey: CryptoKey,
  ttlSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(privateKey as unknown as import("jose").SigningKey);
}

export async function verifyJwt(token: string, publicKey: CryptoKey): Promise<JWTVerifyResult> {
  return jwtVerify(token, publicKey as unknown as import("jose").VerificationKey, {
    algorithms: ["EdDSA"],
  });
}

export async function signEd25519(data: Uint8Array, privateKey: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, data));
}

export async function verifyEd25519(
  data: Uint8Array,
  signature: Uint8Array,
  publicKey: CryptoKey
): Promise<boolean> {
  return crypto.subtle.verify("Ed25519", publicKey, signature, data);
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToArrayBuffer(input: string): Uint8Array {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export async function hmacSha256Verify(
  key: string,
  data: string,
  signatureHex: string
): Promise<boolean> {
  const keyBuffer = new TextEncoder().encode(key);
  const dataBuffer = new TextEncoder().encode(data);
  const sigBytes = hexToBytes(signatureHex);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", cryptoKey, sigBytes, dataBuffer);
}

export async function hmacSha256Sign(key: string, data: string): Promise<string> {
  const keyBuffer = new TextEncoder().encode(key);
  const dataBuffer = new TextEncoder().encode(data);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, dataBuffer);
  return arrayBufferToBase64Url(sig);
}
