import { arrayBufferToBase64Url, hexToBytes } from "./crypto";

type Env = { R2: R2Bucket };

export type PresignedUrlResult = { url: string; expiresAt: number };

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return arrayBufferToBase64Url(buf).replace(/[^a-f0-9]/gi, "");
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
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
  const bytes = new Uint8Array(sig);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function getR2PresignedUrl(
  env: Env,
  bucket: string,
  key: string,
  method: "GET" | "PUT",
  expiresInSeconds: number = 300
): Promise<PresignedUrlResult> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const expiresAt = Math.floor(now.getTime() / 1000) + expiresInSeconds;
  const region = "auto";
  const service = "s3";
  const algorithm = "AWS4-HMAC-SHA256";
  const host = `${bucket}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${bucket}/${encodeURIComponent(key)}`;
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalQuery = method === "GET" ? `X-Amz-Algorithm=${algorithm}&X-Amz-Credential=${encodeURIComponent(
    `auto/${credentialScope}`
  )}&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresInSeconds}&X-Amz-SignedHeaders=${signedHeaders}` : "";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  ].join("\n");

  const hashedCanonicalRequest = await sha256Hex(canonicalRequest);
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    hashedCanonicalRequest,
  ].join("\n");

  const kDate = await hmacSha256Hex(`AWS4${env.R2 as unknown as string}`, dateStamp);
  const kRegion = await hmacSha256Hex(kDate, region);
  const kService = await hmacSha256Hex(kRegion, service);
  const kSigning = await hmacSha256Hex(kService, "aws4_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);

  const queryParams = canonicalQuery
    ? `${canonicalQuery}&X-Amz-Signature=${signature}`
    : `X-Amz-Algorithm=${algorithm}&X-Amz-Credential=${encodeURIComponent(
        `auto/${credentialScope}`
      )}&X-Amz-Date=${amzDate}&X-Amz-Expires=${expiresInSeconds}&X-Amz-SignedHeaders=${signedHeaders}&X-Amz-Signature=${signature}`;

  const url = `https://${host}${canonicalUri}?${queryParams}`;
  return { url, expiresAt };
}
