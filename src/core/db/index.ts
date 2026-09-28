/**
 * Postgres client — driver selected automatically from the connection string.
 *
 *   • Neon host → @neondatabase/serverless (WebSocket). This is production:
 *                 Vercel Functions have no persistent socket, and Neon's
 *                 serverless driver is built for exactly that.
 *   • any other host (localhost, Docker, RDS…) → node-postgres.
 *
 * Both give real transactions, which inventory mutations require: marking a dose
 * taken writes the dose event AND the inventory deduction atomically, and a
 * replayed mutation must be a no-op (§7, §16).
 *
 * Node runtime only — never import from Edge middleware or a client component.
 */

import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { Pool as PgPool } from "pg";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type Database =
  | ReturnType<typeof drizzleNeon<typeof schema>>
  | ReturnType<typeof drizzlePg<typeof schema>>;

let _db: Database | null = null;

function requireUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Neon connection string.",
    );
  }
  return url;
}

function isNeon(url: string): boolean {
  try {
    return new URL(url).hostname.includes("neon");
  } catch {
    return false;
  }
}

export function getDb(): Database {
  if (_db) return _db;

  const url = requireUrl();

  _db = isNeon(url)
    ? drizzleNeon(new NeonPool({ connectionString: url }), { schema })
    : drizzlePg(new PgPool({ connectionString: url }), { schema });

  return _db;
}

/**
 * Lazy proxy so `next build` never needs a live database or env var. The error
 * surfaces on first real query with an actionable message.
 */
export const db = new Proxy({} as Database, {
  get(_t, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export { schema };
