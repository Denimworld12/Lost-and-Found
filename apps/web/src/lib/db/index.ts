import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { serverEnv } from "../env";
import * as schema from "./schema";

export type Db = NeonDatabase<typeof schema>;

let pool: Pool | undefined;
let db: Db | undefined;

/**
 * Neon over WebSockets (Node 22+ has a global `WebSocket`). The WebSocket pool, unlike the HTTP
 * driver, keeps a session per connection, which the verifier's advisory lock needs.
 */
export function getPool(): Pool {
  pool ??= new Pool({ connectionString: serverEnv.databaseUrl() });
  return pool;
}

export function getDb(): Db {
  db ??= drizzle({ client: getPool(), schema });
  return db;
}

export * from "./schema";
