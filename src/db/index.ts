import { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export type DB = ReturnType<typeof drizzle>;

export function getDb(env: { DB: D1Database }): DB {
  return drizzle(env.DB, { schema });
}

export { schema };
