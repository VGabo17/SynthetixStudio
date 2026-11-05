import { NextResponse } from "next/server";
import { z } from "zod";

type Env = {
  KV: KVNamespace;
};

const CODE_CHALLENGE_LENGTH = 43;

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const runtime = "edge";

export async function GET(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env;
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const redirectUri = `${new URL(request.url).origin}/api/auth/discord/callback`;

  if (!clientId) {
    return NextResponse.json({ error: "Discord not configured" }, { status: 500 });
  }

  const verifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64UrlEncode(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  );

  const state = crypto.randomUUID();

  if (env?.KV) {
    await env.KV.put(`discord_pkce:${state}`, verifier, { expirationTtl: 600 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
}

const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const env = (request as unknown as { env?: Env }).env;
  const body = await request.json();
  const parsed = callbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid callback" }, { status: 400 });
  }

  const { code, state } = parsed.data;
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = `${new URL(request.url).origin.replace("/api/auth/discord/callback", "")}/api/auth/discord/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Discord not configured" }, { status: 500 });
  }

  let verifier: string | null = null;
  if (env?.KV) {
    verifier = await env.KV.get(`discord_pkce:${state}`);
    if (!verifier) {
      return NextResponse.json({ error: "Invalid or expired state" }, { status: 403 });
    }
    await env.KV.delete(`discord_pkce:${state}`);
  }

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier ?? "",
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.json({ error: "Token exchange failed" }, { status: 400 });
  }

  const tokens = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) {
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 400 });
  }

  const user = await userRes.json();
  const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const guilds = guildsRes.ok ? (await guildsRes.json()) : [];

  const isInGuild = guilds.some(
    (g: { id: string }) => g.id === process.env.DISCORD_GUILD_ID
  );

  return NextResponse.json({
    user,
    access_token: tokens.access_token,
    in_official_guild: isInGuild,
  });
}
