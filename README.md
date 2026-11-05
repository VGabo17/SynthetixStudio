# Synthetix Studio — Enterprise Edge Platform

Stack: Next.js App Router, Cloudflare Workers/Pages, D1 + Drizzle, R2, KV, Durable Objects, jose, Zod.

## Requisitos
- Node.js 18+
- Wrangler CLI (`npm i -g wrangler`)
- Cuenta Cloudflare con D1, KV y R2 habilitados

## Instalación

```bash
npm install
cp .env.example .env
# Edita .env con tus secrets (Stripe, PayPal, Discord, claves Ed25519, etc.)
```

## Base de Datos (D1)

```bash
# Crear base de datos D1
wrangler d1 create synthetix-studio

# Copia el database_id a wrangler.toml en [[d1_databases]].database_id

# Generar migraciones
npm run db:generate

# Aplicar esquema (ajusta el nombre de la DB)
wrangler d1 execute synthetix-studio --file=.drizzle/schema.sql
```

## Desarrollo

```bash
# Next.js (puerto 3000)
npm run dev

# Cloudflare Workers local (para funciones edge)
wrangler dev --local
```

## Despliegue (Cloudflare Pages)

```bash
npm run build
wrangler pages deploy .next
```

## Estructura de entregables

| Archivo | Responsabilidad |
|---------|-----------------|
| `src/db/schema.ts` | Esquema Drizzle D1 (10 tablas) + Zod |
| `src/lib/crypto.ts` | Web Crypto API, PBKDF2, JWT Ed25519, HMAC |
| `src/lib/jwt.ts` | Access/refresh token pair |
| `src/lib/session.ts` | Sesiones, rotación, revocación KV |
| `src/lib/kv.ts` | Rate-limit token bucket, KV helpers |
| `src/lib/r2.ts` | Presigned URLs AWS Signature V4 |
| `src/server/durable-objects/ChatRoom.ts` | Chat WebSocket hibernación |
| `src/middleware.ts` | Seguridad headers, sesión, RBAC, rate-limit |
| `src/app/api/webhooks/stripe/route.ts` | Stripe webhook + idempotencia + split 50/50 |
| `src/app/api/webhooks/paypal/route.ts` | PayPal webhook |
| `src/app/api/webhooks/cryptomus/route.ts` | Cryptomus webhook HMAC |
| `src/app/api/webhooks/binance/route.ts` | Binance Pay webhook HMAC |
| `src/app/api/v1/license/verify/route.ts` | DRM anti-replay, anti-tampering |
| `src/app/api/auth/discord/route.ts` | OAuth2 Discord PKCE |
| `src/app/api/auth/refresh/route.ts` | Rotación refresh token |
| `src/app/api/auth/logout/route.ts` | Revocación sesión |
| `src/app/api/projects/[projectId]/download-url/route.ts` | Descarga R2 firmada 5 min |
| `src/app/api/projects/[projectId]/upload-url/route.ts` | Subida R2 firmada |
| `src/components/dashboard/MilestoneTracker.tsx` | Tracker 50/50 + descarga |
| `tailwind.config.ts` | Tema cyberpunk neón |

## Reglas cumplidas
- Zero mocks / zero placeholders / sin `any`
- Estricto TypeScript (`strict: true`)
- Web Crypto API nativa (sin `fs`, `crypto` de Node)
- Idempotencia financiera en D1
- Validación Zod en todas las entradas
- Headers de seguridad (HSTS, CSP, X-Frame-Options)
